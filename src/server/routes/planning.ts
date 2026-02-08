import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

// Helper to get Monday of a week
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Helper to get Sunday of a week
function getSunday(date: Date): Date {
  const monday = getMonday(date);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday;
}

const prioritySchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 1000 })),
  order: t.Number({ minimum: 1, maximum: 3 }),
});

const completePlanningSchema = t.Object({
  priorities: t.Array(prioritySchema, { minItems: 1, maxItems: 3 }),
  notes: t.Optional(t.String({ maxLength: 2000 })),
});

export const planningRoutes = new Elysia({ prefix: "/planning" })
  .use(authPlugin)

  // Get current week's plan
  .get("/current", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const now = new Date();
    const weekStart = getMonday(now);
    const weekEnd = getSunday(now);

    let plan = await db.weeklyPlan.findUnique({
      where: {
        userId_weekStart: {
          userId: user.id,
          weekStart,
        },
      },
      include: {
        priorities: {
          orderBy: { order: "asc" },
        },
      },
    });

    // If no plan exists, create one with last week's review
    if (!plan) {
      const lastWeekStart = new Date(weekStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      const lastWeekEnd = new Date(weekEnd);
      lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);

      // Get last week's task stats
      const lastWeekTasks = await db.task.findMany({
        where: {
          userId: user.id,
          createdAt: {
            gte: lastWeekStart,
            lte: lastWeekEnd,
          },
        },
        select: { status: true },
      });

      const tasksPlanned = lastWeekTasks.length;
      const tasksCompleted = lastWeekTasks.filter((t) => t.status === "COMPLETED").length;
      const completionRate = tasksPlanned > 0 ? (tasksCompleted / tasksPlanned) * 100 : 0;

      plan = await db.weeklyPlan.create({
        data: {
          userId: user.id,
          weekStart,
          weekEnd,
          tasksPlanned,
          tasksCompleted,
          completionRate,
        },
        include: {
          priorities: true,
        },
      });
    }

    return { plan };
  })

  // Get weekly review (last week stats)
  .get("/review", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const now = new Date();
    const lastWeekStart = getMonday(now);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = getSunday(now);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);

    // Get task stats
    const tasks = await db.task.findMany({
      where: {
        userId: user.id,
        createdAt: {
          gte: lastWeekStart,
          lte: lastWeekEnd,
        },
      },
      select: { status: true, category: true, completedAt: true },
    });

    const completed = tasks.filter((t) => t.status === "COMPLETED").length;
    const snoozed = tasks.filter((t) => t.status === "SNOOZED").length;
    const escalated = tasks.filter((t) => t.status === "ESCALATED").length;

    // Category breakdown
    const categoryStats = tasks.reduce(
      (acc, task) => {
        if (!acc[task.category]) {
          acc[task.category] = { total: 0, completed: 0 };
        }
        acc[task.category].total++;
        if (task.status === "COMPLETED") acc[task.category].completed++;
        return acc;
      },
      {} as Record<string, { total: number; completed: number }>
    );

    // Habit stats
    const habits = await db.habitLog.findMany({
      where: {
        habit: { userId: user.id },
        loggedAt: {
          gte: lastWeekStart,
          lte: lastWeekEnd,
        },
        completed: true,
      },
    });

    // XP earned
    const xpEarned = await db.xpTransaction.aggregate({
      where: {
        userId: user.id,
        createdAt: {
          gte: lastWeekStart,
          lte: lastWeekEnd,
        },
      },
      _sum: { amount: true },
    });

    // Nutrition consistency
    const nutritionDays = await db.nutritionLog.groupBy({
      by: ["loggedAt"],
      where: {
        userId: user.id,
        loggedAt: {
          gte: lastWeekStart,
          lte: lastWeekEnd,
        },
      },
    });

    return {
      period: {
        start: lastWeekStart,
        end: lastWeekEnd,
      },
      tasks: {
        total: tasks.length,
        completed,
        snoozed,
        escalated,
        completionRate: tasks.length > 0 ? (completed / tasks.length) * 100 : 0,
      },
      categories: categoryStats,
      habits: {
        completions: habits.length,
      },
      xp: {
        earned: xpEarned._sum.amount || 0,
      },
      nutrition: {
        daysLogged: nutritionDays.length,
        consistency: (nutritionDays.length / 7) * 100,
      },
    };
  })

  // Set weekly priorities
  .post(
    "/priorities",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const weekStart = getMonday(new Date());
      const weekEnd = getSunday(new Date());

      // Get or create plan
      let plan = await db.weeklyPlan.findUnique({
        where: {
          userId_weekStart: {
            userId: user.id,
            weekStart,
          },
        },
      });

      if (!plan) {
        plan = await db.weeklyPlan.create({
          data: {
            userId: user.id,
            weekStart,
            weekEnd,
          },
        });
      }

      // Delete existing priorities and create new ones
      await db.weeklyPriority.deleteMany({
        where: { weeklyPlanId: plan.id },
      });

      const priorities = await Promise.all(
        body.priorities.map((p) =>
          db.weeklyPriority.create({
            data: {
              weeklyPlanId: plan!.id,
              title: p.title,
              description: p.description,
              order: p.order,
            },
          })
        )
      );

      // Update plan notes if provided
      if (body.notes !== undefined) {
        await db.weeklyPlan.update({
          where: { id: plan.id },
          data: { notes: body.notes },
        });
      }

      return { priorities };
    },
    { body: completePlanningSchema }
  )

  // Complete weekly planning session
  .post("/complete", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const weekStart = getMonday(new Date());

    const plan = await db.weeklyPlan.findUnique({
      where: {
        userId_weekStart: {
          userId: user.id,
          weekStart,
        },
      },
      include: { priorities: true },
    });

    if (!plan) return authError(404, "No plan found for this week");
    if (plan.planningCompleted) return authError(400, "Planning already completed for this week");
    if (plan.priorities.length === 0) return authError(400, "Set at least one priority before completing");

    // Mark as completed
    await db.weeklyPlan.update({
      where: { id: plan.id },
      data: {
        planningCompleted: true,
        planningCompletedAt: new Date(),
      },
    });

    // Award XP for weekly planning
    await db.xpTransaction.create({
      data: {
        userId: user.id,
        amount: 50,
        source: "WEEKLY_PLANNING",
        sourceId: plan.id,
        description: "Completed weekly planning session",
      },
    });

    // Update user stats
    await db.userStats.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        totalXp: 50,
      },
      update: {
        totalXp: { increment: 50 },
      },
    });

    return {
      success: true,
      xpAwarded: 50,
      message: "Weekly planning completed! +50 XP",
    };
  })

  // Toggle priority completion
  .post("/:priorityId/toggle", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const priority = await db.weeklyPriority.findUnique({
      where: { id: params.priorityId },
      include: { weeklyPlan: true },
    });

    if (!priority) return authError(404, "Priority not found");
    if (priority.weeklyPlan.userId !== user.id) return authError(403, "Access denied");

    const updated = await db.weeklyPriority.update({
      where: { id: params.priorityId },
      data: { completed: !priority.completed },
    });

    return { priority: updated };
  })

  // Get planning history
  .get(
    "/history",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const limit = query.limit || 10;

      const plans = await db.weeklyPlan.findMany({
        where: { userId: user.id },
        include: {
          priorities: {
            orderBy: { order: "asc" },
          },
        },
        orderBy: { weekStart: "desc" },
        take: limit,
      });

      return { plans };
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number({ minimum: 1, maximum: 52 })),
      }),
    }
  );
