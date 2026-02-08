import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

const applicationStatusEnum = {
  SAVED: "SAVED",
  APPLIED: "APPLIED",
  PHONE_SCREEN: "PHONE_SCREEN",
  INTERVIEW: "INTERVIEW",
  FINAL_ROUND: "FINAL_ROUND",
  OFFER: "OFFER",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  WITHDRAWN: "WITHDRAWN",
} as const;

const createApplicationSchema = t.Object({
  company: t.String({ minLength: 1, maxLength: 255 }),
  position: t.String({ minLength: 1, maxLength: 255 }),
  url: t.Optional(t.String({ maxLength: 500 })),
  status: t.Optional(t.Enum(applicationStatusEnum)),
  appliedAt: t.Optional(t.String({ format: "date-time" })),
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

const updateApplicationSchema = t.Object({
  company: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  position: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  url: t.Optional(t.String({ maxLength: 500 })),
  status: t.Optional(t.Enum(applicationStatusEnum)),
  notes: t.Optional(t.String({ maxLength: 2000 })),
  nextFollowUp: t.Optional(t.String({ format: "date" })),
});

export const applicationsRoutes = new Elysia({ prefix: "/applications" })
  .use(authPlugin)

  // Get all applications
  .get(
    "/",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const status = query.status;

      const applications = await db.application.findMany({
        where: {
          userId: user.id,
          ...(status && { status: status as keyof typeof applicationStatusEnum }),
        },
        orderBy: { updatedAt: "desc" },
      });

      return { applications };
    },
    {
      query: t.Object({
        status: t.Optional(t.String()),
      }),
    }
  )

  // Get single application
  .get("/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const application = await db.application.findUnique({
      where: { id: params.id },
    });

    if (!application) return authError(404, "Application not found");
    if (application.userId !== user.id) return authError(403, "Access denied");

    return { application };
  })

  // Create application
  .post(
    "/",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const appliedAt = body.appliedAt ? new Date(body.appliedAt) : new Date();
      
      // Calculate next follow-up (5-7 days after applying)
      const nextFollowUp = new Date(appliedAt);
      nextFollowUp.setDate(nextFollowUp.getDate() + 5);

      const application = await db.application.create({
        data: {
          userId: user.id,
          company: body.company,
          position: body.position,
          url: body.url,
          status: body.status || "APPLIED",
          appliedAt,
          nextFollowUp,
          notes: body.notes,
        },
      });

      // Create follow-up task
      await db.task.create({
        data: {
          userId: user.id,
          title: `Follow up: ${body.company} - ${body.position}`,
          description: `Follow up on your application to ${body.company}`,
          category: "Career",
          priority: "HIGH",
          scheduledAt: nextFollowUp,
        },
      });

      return {
        application,
        followUpTaskCreated: true,
        nextFollowUp,
      };
    },
    { body: createApplicationSchema }
  )

  // Update application
  .patch(
    "/:id",
    async ({ user, authError, params, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const existing = await db.application.findUnique({
        where: { id: params.id },
      });

      if (!existing) return authError(404, "Application not found");
      if (existing.userId !== user.id) return authError(403, "Access denied");

      const application = await db.application.update({
        where: { id: params.id },
        data: {
          company: body.company,
          position: body.position,
          url: body.url,
          status: body.status as keyof typeof applicationStatusEnum | undefined,
          notes: body.notes,
          nextFollowUp: body.nextFollowUp ? new Date(body.nextFollowUp) : undefined,
        },
      });

      return { application };
    },
    { body: updateApplicationSchema }
  )

  // Update status (quick action)
  .post(
    "/:id/status",
    async ({ user, authError, params, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const existing = await db.application.findUnique({
        where: { id: params.id },
      });

      if (!existing) return authError(404, "Application not found");
      if (existing.userId !== user.id) return authError(403, "Access denied");

      const application = await db.application.update({
        where: { id: params.id },
        data: {
          status: body.status,
          // Clear follow-up for terminal states
          nextFollowUp: ["ACCEPTED", "REJECTED", "WITHDRAWN"].includes(body.status) ? null : existing.nextFollowUp,
        },
      });

      // If moving to interview stages, create prep task
      if (["PHONE_SCREEN", "INTERVIEW", "FINAL_ROUND"].includes(body.status)) {
        const interviewDate = new Date();
        interviewDate.setDate(interviewDate.getDate() + 2); // 2 days to prep

        await db.task.create({
          data: {
            userId: user.id,
            title: `Prepare for ${body.status.replace("_", " ").toLowerCase()}: ${existing.company}`,
            description: `Research company, prepare STAR stories, review job description`,
            category: "Career",
            priority: "URGENT",
            scheduledAt: new Date(),
            dueAt: interviewDate,
          },
        });
      }

      return { application };
    },
    {
      body: t.Object({
        status: t.Enum(applicationStatusEnum),
      }),
    }
  )

  // Log follow-up
  .post("/:id/follow-up", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const existing = await db.application.findUnique({
      where: { id: params.id },
    });

    if (!existing) return authError(404, "Application not found");
    if (existing.userId !== user.id) return authError(403, "Access denied");

    // Set next follow-up to 7 days from now
    const nextFollowUp = new Date();
    nextFollowUp.setDate(nextFollowUp.getDate() + 7);

    const application = await db.application.update({
      where: { id: params.id },
      data: {
        lastFollowUp: new Date(),
        nextFollowUp,
        followUpCount: { increment: 1 },
      },
    });

    // Create follow-up task
    await db.task.create({
      data: {
        userId: user.id,
        title: `Follow up #${application.followUpCount + 1}: ${existing.company}`,
        description: `Follow up on your application to ${existing.company}`,
        category: "Career",
        priority: "MEDIUM",
        scheduledAt: nextFollowUp,
      },
    });

    return {
      application,
      nextFollowUp,
      followUpCount: application.followUpCount,
    };
  })

  // Delete application
  .delete("/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const existing = await db.application.findUnique({
      where: { id: params.id },
    });

    if (!existing) return authError(404, "Application not found");
    if (existing.userId !== user.id) return authError(403, "Access denied");

    await db.application.delete({ where: { id: params.id } });

    return { success: true };
  })

  // Get analytics
  .get("/analytics", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const applications = await db.application.findMany({
      where: { userId: user.id },
      select: { status: true, appliedAt: true, createdAt: true },
    });

    const total = applications.length;
    
    // Status breakdown
    const statusBreakdown = applications.reduce(
      (acc, app) => {
        acc[app.status] = (acc[app.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Calculate rates
    const applied = applications.filter((a) => a.status !== "SAVED").length;
    const responses = applications.filter((a) => !["SAVED", "APPLIED"].includes(a.status)).length;
    const interviews = applications.filter((a) =>
      ["PHONE_SCREEN", "INTERVIEW", "FINAL_ROUND", "OFFER", "ACCEPTED"].includes(a.status)
    ).length;
    const offers = applications.filter((a) => ["OFFER", "ACCEPTED"].includes(a.status)).length;

    // Weekly applications (last 4 weeks)
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    
    const recentApps = applications.filter((a) => new Date(a.appliedAt) >= fourWeeksAgo);
    const weeklyApps: Record<string, number> = {};
    
    recentApps.forEach((a) => {
      const week = getWeekStart(new Date(a.appliedAt));
      weeklyApps[week] = (weeklyApps[week] || 0) + 1;
    });

    return {
      total,
      statusBreakdown,
      rates: {
        responseRate: applied > 0 ? Math.round((responses / applied) * 100) : 0,
        interviewRate: applied > 0 ? Math.round((interviews / applied) * 100) : 0,
        offerRate: interviews > 0 ? Math.round((offers / interviews) * 100) : 0,
      },
      counts: {
        applied,
        responses,
        interviews,
        offers,
      },
      weeklyApplications: weeklyApps,
    };
  })

  // Get pending follow-ups
  .get("/pending-follow-ups", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const now = new Date();

    const applications = await db.application.findMany({
      where: {
        userId: user.id,
        nextFollowUp: { lte: now },
        status: { notIn: ["ACCEPTED", "REJECTED", "WITHDRAWN", "SAVED"] },
      },
      orderBy: { nextFollowUp: "asc" },
    });

    return {
      applications,
      count: applications.length,
    };
  });

// Helper
function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}
