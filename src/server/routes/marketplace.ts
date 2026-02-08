import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

export const marketplaceRoutes = new Elysia({ prefix: "/marketplace" })
  .use(authPlugin)

  // Browse published templates
  .get(
    "/",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const limit = query.limit || 20;
      const offset = query.offset || 0;

      const templates = await db.publishedTemplate.findMany({
        where: {
          status: "APPROVED",
          ...(query.category && { category: query.category }),
          ...(query.search && {
            OR: [
              { title: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
              { tags: { has: query.search.toLowerCase() } },
            ],
          }),
        },
        orderBy: query.sort === "popular" 
          ? { useCount: "desc" } 
          : query.sort === "top" 
          ? { upvotes: "desc" } 
          : { createdAt: "desc" },
        take: limit,
        skip: offset,
      });

      // Get author info
      const authorIds = [...new Set(templates.map((t) => t.authorId))];
      const authors = await db.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, name: true, image: true },
      });

      // Get user's votes
      const votes = await db.templateVote.findMany({
        where: {
          userId: user.id,
          templateId: { in: templates.map((t) => t.id) },
        },
      });
      const userVotes = new Map(votes.map((v) => [v.templateId, v.isUpvote]));

      const templatesWithDetails = templates.map((t) => ({
        ...t,
        author: authors.find((a) => a.id === t.authorId),
        userVote: userVotes.get(t.id) ?? null,
        score: t.upvotes - t.downvotes,
      }));

      const total = await db.publishedTemplate.count({
        where: { status: "APPROVED" },
      });

      return { templates: templatesWithDetails, total, limit, offset };
    },
    {
      query: t.Object({
        category: t.Optional(t.String()),
        search: t.Optional(t.String()),
        sort: t.Optional(t.Union([t.Literal("recent"), t.Literal("popular"), t.Literal("top")])),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 50 })),
        offset: t.Optional(t.Number({ minimum: 0 })),
      }),
    }
  )

  // Get featured templates
  .get("/featured", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const featured = await db.publishedTemplate.findMany({
      where: {
        status: "APPROVED",
        isFeatured: true,
      },
      orderBy: { upvotes: "desc" },
      take: 10,
    });

    const authorIds = [...new Set(featured.map((t) => t.authorId))];
    const authors = await db.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, name: true, image: true },
    });

    return {
      templates: featured.map((t) => ({
        ...t,
        author: authors.find((a) => a.id === t.authorId),
        score: t.upvotes - t.downvotes,
      })),
    };
  })

  // Get template categories
  .get("/categories", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const categories = await db.publishedTemplate.groupBy({
      by: ["category"],
      where: { status: "APPROVED" },
      _count: { id: true },
    });

    return {
      categories: categories.map((c) => ({
        name: c.category,
        count: c._count.id,
      })),
    };
  })

  // Get single template
  .get("/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const template = await db.publishedTemplate.findUnique({
      where: { id: params.id },
      include: {
        comments: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!template) return authError(404, "Template not found");
    if (template.status !== "APPROVED" && template.authorId !== user.id) {
      return authError(403, "Template not available");
    }

    // Get author
    const author = await db.user.findUnique({
      where: { id: template.authorId },
      select: { id: true, name: true, image: true },
    });

    // Get comment authors
    const commentAuthorIds = [...new Set(template.comments.map((c) => c.userId))];
    const commentAuthors = await db.user.findMany({
      where: { id: { in: commentAuthorIds } },
      select: { id: true, name: true, image: true },
    });

    // Get user's vote
    const userVote = await db.templateVote.findUnique({
      where: {
        templateId_userId: { templateId: template.id, userId: user.id },
      },
    });

    return {
      template: {
        ...template,
        author,
        userVote: userVote?.isUpvote ?? null,
        score: template.upvotes - template.downvotes,
        comments: template.comments.map((c) => ({
          ...c,
          author: commentAuthors.find((a) => a.id === c.userId),
        })),
      },
    };
  })

  // Publish a template
  .post(
    "/publish",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      // Get original template
      const template = await db.taskTemplate.findUnique({
        where: { id: body.templateId },
      });

      if (!template) return authError(404, "Template not found");
      if (template.userId !== user.id && !template.isSystem) {
        return authError(403, "Can only publish your own templates");
      }

      // Check user level for auto-approval
      const stats = await db.userStats.findUnique({ where: { userId: user.id } });
      const userLevel = calculateLevel(stats?.totalXp || 0);
      const autoApprove = userLevel >= 10;

      // Parse tasks JSON
      const tasksData = template.tasks as Array<{
        title: string;
        description?: string;
        category?: string;
        priority?: string;
        estimatedMinutes?: number;
        order?: number;
      }>;

      // Create published template
      const published = await db.publishedTemplate.create({
        data: {
          templateId: template.id,
          authorId: user.id,
          title: body.title || template.name,
          description: body.description || template.description || "",
          category: body.category || template.category,
          tags: body.tags || [],
          templateData: {
            name: template.name,
            category: template.category,
            items: tasksData.map((i) => ({
              title: i.title,
              description: i.description,
              category: i.category,
              priority: i.priority,
              estimatedMinutes: i.estimatedMinutes,
              order: i.order,
            })),
          },
          status: autoApprove ? "APPROVED" : "PENDING",
        },
      });

      return { template: published, autoApproved: autoApprove };
    },
    {
      body: t.Object({
        templateId: t.String(),
        title: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        description: t.Optional(t.String({ maxLength: 2000 })),
        category: t.Optional(t.String()),
        tags: t.Optional(t.Array(t.String())),
      }),
    }
  )

  // Vote on a template
  .post(
    "/:id/vote",
    async ({ user, authError, params, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const template = await db.publishedTemplate.findUnique({
        where: { id: params.id },
      });

      if (!template) return authError(404, "Template not found");
      if (template.status !== "APPROVED") return authError(400, "Cannot vote on unapproved templates");

      // Check existing vote
      const existing = await db.templateVote.findUnique({
        where: {
          templateId_userId: { templateId: params.id, userId: user.id },
        },
      });

      if (existing) {
        if (existing.isUpvote === body.isUpvote) {
          // Remove vote (toggle off)
          await db.templateVote.delete({ where: { id: existing.id } });
          await db.publishedTemplate.update({
            where: { id: params.id },
            data: body.isUpvote ? { upvotes: { decrement: 1 } } : { downvotes: { decrement: 1 } },
          });
          return { voted: false, isUpvote: null };
        } else {
          // Change vote
          await db.templateVote.update({
            where: { id: existing.id },
            data: { isUpvote: body.isUpvote },
          });
          await db.publishedTemplate.update({
            where: { id: params.id },
            data: body.isUpvote 
              ? { upvotes: { increment: 1 }, downvotes: { decrement: 1 } }
              : { upvotes: { decrement: 1 }, downvotes: { increment: 1 } },
          });
          return { voted: true, isUpvote: body.isUpvote };
        }
      } else {
        // New vote
        await db.templateVote.create({
          data: {
            templateId: params.id,
            userId: user.id,
            isUpvote: body.isUpvote,
          },
        });
        await db.publishedTemplate.update({
          where: { id: params.id },
          data: body.isUpvote ? { upvotes: { increment: 1 } } : { downvotes: { increment: 1 } },
        });
        return { voted: true, isUpvote: body.isUpvote };
      }
    },
    {
      body: t.Object({
        isUpvote: t.Boolean(),
      }),
    }
  )

  // Comment on a template
  .post(
    "/:id/comment",
    async ({ user, authError, params, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const template = await db.publishedTemplate.findUnique({
        where: { id: params.id },
      });

      if (!template) return authError(404, "Template not found");
      if (template.status !== "APPROVED") return authError(400, "Cannot comment on unapproved templates");

      const comment = await db.templateComment.create({
        data: {
          templateId: params.id,
          userId: user.id,
          content: body.content,
        },
      });

      const author = await db.user.findUnique({
        where: { id: user.id },
        select: { id: true, name: true, image: true },
      });

      return { comment: { ...comment, author } };
    },
    {
      body: t.Object({
        content: t.String({ minLength: 1, maxLength: 1000 }),
      }),
    }
  )

  // Import a template (copy to user's templates)
  .post("/:id/import", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const published = await db.publishedTemplate.findUnique({
      where: { id: params.id },
    });

    if (!published) return authError(404, "Template not found");
    if (published.status !== "APPROVED") return authError(400, "Cannot import unapproved templates");

    const templateData = published.templateData as {
      name: string;
      category: string;
      items: Array<{
        title: string;
        description?: string;
        category?: string;
        priority?: string;
        estimatedMinutes?: number;
        order: number;
      }>;
    };

    // Create new template for user - tasks stored as JSON
    const newTemplate = await db.taskTemplate.create({
      data: {
        userId: user.id,
        name: `${templateData.name} (imported)`,
        category: templateData.category,
        isSystem: false,
        tasks: templateData.items.map((item) => ({
          title: item.title,
          description: item.description || "",
          category: item.category || "General",
          priority: item.priority || "MEDIUM",
          estimatedMinutes: item.estimatedMinutes || 30,
          order: item.order,
        })),
      },
    });

    // Increment use count
    await db.publishedTemplate.update({
      where: { id: params.id },
      data: { useCount: { increment: 1 } },
    });

    return { template: newTemplate };
  })

  // Get user's published templates
  .get("/mine", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const templates = await db.publishedTemplate.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: "desc" },
    });

    return {
      templates: templates.map((t) => ({
        ...t,
        score: t.upvotes - t.downvotes,
      })),
    };
  })

  // Delete a published template (author only)
  .delete("/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const template = await db.publishedTemplate.findUnique({
      where: { id: params.id },
    });

    if (!template) return authError(404, "Template not found");
    if (template.authorId !== user.id) {
      return authError(403, "Can only delete your own templates");
    }

    await db.publishedTemplate.delete({ where: { id: params.id } });

    return { success: true };
  });

// Helper: Calculate level from XP
function calculateLevel(xp: number): number {
  if (xp < 1000) return Math.floor(xp / 100) + 1;
  if (xp < 4000) return 10 + Math.floor((xp - 1000) / 200);
  if (xp < 16500) return 25 + Math.floor((xp - 4000) / 500);
  return 50 + Math.floor((xp - 16500) / 1000);
}
