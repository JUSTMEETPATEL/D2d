import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

const createClanTaskSchema = t.Object({
  clanId: t.String(),
  title: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
  dueAt: t.Optional(t.String({ format: "date-time" })),
  xpReward: t.Optional(t.Number({ minimum: 5, maximum: 100 })),
});

export const clanTasksRoutes = new Elysia({ prefix: "/clan-tasks" })
  .use(authPlugin)

  // Get clan tasks
  .get(
    "/",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const { clanId } = query;

      // Verify membership
      const membership = await db.clanMembership.findFirst({
        where: { userId: user.id, clanId },
      });

      if (!membership) return authError(403, "Not a member of this clan");

      const tasks = await db.clanTask.findMany({
        where: { clanId },
        include: {
          completions: {
            select: {
              userId: true,
              completedAt: true,
            },
          },
          _count: {
            select: { completions: true },
          },
        },
        orderBy: { dueAt: "asc" },
      });

      // Get member count for completion percentage
      const memberCount = await db.clanMembership.count({
        where: { clanId },
      });

      const tasksWithProgress = tasks.map((task) => ({
        ...task,
        completionCount: task._count.completions,
        memberCount,
        completionPercent: Math.round((task._count.completions / memberCount) * 100),
        userCompleted: task.completions.some((c) => c.userId === user.id),
      }));

      return { tasks: tasksWithProgress };
    },
    {
      query: t.Object({
        clanId: t.String(),
      }),
    }
  )

  // Get single clan task with details
  .get("/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const task = await db.clanTask.findUnique({
      where: { id: params.id },
      include: {
        clan: {
          select: { id: true, name: true },
        },
        completions: {
          select: {
            userId: true,
            completedAt: true,
          },
        },
      },
    });

    if (!task) return authError(404, "Clan task not found");

    // Verify membership
    const membership = await db.clanMembership.findFirst({
      where: { userId: user.id, clanId: task.clanId },
    });

    if (!membership) return authError(403, "Not a member of this clan");

    const memberCount = await db.clanMembership.count({
      where: { clanId: task.clanId },
    });

    return {
      task: {
        ...task,
        completionCount: task.completions.length,
        memberCount,
        completionPercent: Math.round((task.completions.length / memberCount) * 100),
        userCompleted: task.completions.some((c) => c.userId === user.id),
      },
    };
  })

  // Create clan task (admin only)
  .post(
    "/",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      // Verify admin membership
      const membership = await db.clanMembership.findFirst({
        where: { userId: user.id, clanId: body.clanId },
      });

      if (!membership) return authError(403, "Not a member of this clan");
      if (membership.role !== "ADMIN" && membership.role !== "LEADER") {
        return authError(403, "Only admins can create clan tasks");
      }

      const task = await db.clanTask.create({
        data: {
          clanId: body.clanId,
          createdBy: user.id,
          title: body.title,
          description: body.description,
          dueAt: body.dueAt ? new Date(body.dueAt) : null,
          xpReward: body.xpReward || 30,
        },
      });

      return { task };
    },
    { body: createClanTaskSchema }
  )

  // Update clan task
  .patch(
    "/:id",
    async ({ user, authError, params, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const task = await db.clanTask.findUnique({
        where: { id: params.id },
      });

      if (!task) return authError(404, "Clan task not found");

      // Verify admin membership
      const membership = await db.clanMembership.findFirst({
        where: { userId: user.id, clanId: task.clanId },
      });

      if (!membership) return authError(403, "Not a member of this clan");
      if (membership.role !== "ADMIN" && membership.role !== "LEADER") {
        return authError(403, "Only admins can update clan tasks");
      }

      const updated = await db.clanTask.update({
        where: { id: params.id },
        data: {
          title: body.title,
          description: body.description,
          dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
          xpReward: body.xpReward,
        },
      });

      return { task: updated };
    },
    {
      body: t.Object({
        title: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
        description: t.Optional(t.String({ maxLength: 2000 })),
        dueAt: t.Optional(t.String({ format: "date-time" })),
        xpReward: t.Optional(t.Number({ minimum: 5, maximum: 100 })),
      }),
    }
  )

  // Complete clan task (by user)
  .post("/:id/complete", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const task = await db.clanTask.findUnique({
      where: { id: params.id },
    });

    if (!task) return authError(404, "Clan task not found");

    // Verify membership
    const membership = await db.clanMembership.findFirst({
      where: { userId: user.id, clanId: task.clanId },
    });

    if (!membership) return authError(403, "Not a member of this clan");

    // Check if already completed
    const existing = await db.clanTaskCompletion.findUnique({
      where: {
        clanTaskId_userId: {
          clanTaskId: task.id,
          userId: user.id,
        },
      },
    });

    if (existing) return authError(400, "Already completed this task");

    // Create completion
    await db.clanTaskCompletion.create({
      data: {
        clanTaskId: task.id,
        userId: user.id,
      },
    });

    // Award XP
    await db.xpTransaction.create({
      data: {
        userId: user.id,
        amount: task.xpReward,
        source: "CLAN_TASK",
        sourceId: task.id,
        description: `Completed clan task: ${task.title}`,
      },
    });

    await db.userStats.upsert({
      where: { userId: user.id },
      create: { userId: user.id, totalXp: task.xpReward },
      update: { totalXp: { increment: task.xpReward } },
    });

    // Get updated completion count
    const completionCount = await db.clanTaskCompletion.count({
      where: { clanTaskId: task.id },
    });

    const memberCount = await db.clanMembership.count({
      where: { clanId: task.clanId },
    });

    return {
      success: true,
      xpAwarded: task.xpReward,
      completionCount,
      memberCount,
      completionPercent: Math.round((completionCount / memberCount) * 100),
    };
  })

  // Uncomplete clan task
  .delete("/:id/complete", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const task = await db.clanTask.findUnique({
      where: { id: params.id },
    });

    if (!task) return authError(404, "Clan task not found");

    // Verify membership
    const membership = await db.clanMembership.findFirst({
      where: { userId: user.id, clanId: task.clanId },
    });

    if (!membership) return authError(403, "Not a member of this clan");

    // Delete completion
    await db.clanTaskCompletion.deleteMany({
      where: {
        clanTaskId: task.id,
        userId: user.id,
      },
    });

    return { success: true };
  })

  // Delete clan task (admin only)
  .delete("/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const task = await db.clanTask.findUnique({
      where: { id: params.id },
    });

    if (!task) return authError(404, "Clan task not found");

    // Verify admin membership
    const membership = await db.clanMembership.findFirst({
      where: { userId: user.id, clanId: task.clanId },
    });

    if (!membership) return authError(403, "Not a member of this clan");
    if (membership.role !== "ADMIN" && membership.role !== "LEADER") {
      return authError(403, "Only admins can delete clan tasks");
    }

    await db.clanTask.delete({ where: { id: params.id } });

    return { success: true };
  })

  // Get clan task leaderboard
  .get(
    "/leaderboard",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const { clanId } = query;

      // Verify membership
      const membership = await db.clanMembership.findFirst({
        where: { userId: user.id, clanId },
      });

      if (!membership) return authError(403, "Not a member of this clan");

      // Get completions per user
      const completions = await db.clanTaskCompletion.groupBy({
        by: ["userId"],
        where: {
          clanTask: { clanId },
        },
        _count: { userId: true },
        orderBy: { _count: { userId: "desc" } },
      });

      // Get user details
      const userIds = completions.map((c) => c.userId);
      const users = await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, image: true },
      });

      const leaderboard = completions.map((c, index) => {
        const userData = users.find((u) => u.id === c.userId);
        return {
          rank: index + 1,
          userId: c.userId,
          name: userData?.name || "Unknown",
          image: userData?.image,
          completedTasks: c._count.userId,
        };
      });

      return { leaderboard };
    },
    {
      query: t.Object({
        clanId: t.String(),
      }),
    }
  );
