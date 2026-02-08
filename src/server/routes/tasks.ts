import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

// Task status enum matching Prisma schema
const TaskStatus = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  SNOOZED: "SNOOZED",
  ESCALATED: "ESCALATED",
  BLOCKED: "BLOCKED",
} as const;

const TaskPriority = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const;

// Validation schemas
const createTaskSchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
  category: t.Optional(t.String()),
  priority: t.Optional(t.Enum(TaskPriority)),
  scheduledAt: t.Optional(t.String({ format: "date-time" })),
  dueAt: t.Optional(t.String({ format: "date-time" })),
  estimatedMinutes: t.Optional(t.Number({ minimum: 1 })),
  xpReward: t.Optional(t.Number({ minimum: 0, maximum: 100 })),
});

const updateTaskSchema = t.Object({
  title: t.Optional(t.String({ minLength: 1, maxLength: 255 })),
  description: t.Optional(t.String({ maxLength: 2000 })),
  category: t.Optional(t.String()),
  priority: t.Optional(t.Enum(TaskPriority)),
  status: t.Optional(t.Enum(TaskStatus)),
  scheduledAt: t.Optional(t.String({ format: "date-time" })),
  dueAt: t.Optional(t.String({ format: "date-time" })),
  estimatedMinutes: t.Optional(t.Number({ minimum: 1 })),
});

export const tasksRoutes = new Elysia({ prefix: "/tasks" })
  .use(authPlugin)
  // Get all tasks for user
  .get(
    "/",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const { status, category, date } = query;

      const tasks = await db.task.findMany({
        where: {
          userId: user.id,
          ...(status && { status: status as keyof typeof TaskStatus }),
          ...(category && { category }),
          ...(date && {
            scheduledAt: {
              gte: new Date(date),
              lt: new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000),
            },
          }),
        },
        orderBy: [{ priority: "desc" }, { scheduledAt: "asc" }],
      });

      return { tasks };
    },
    {
      query: t.Object({
        status: t.Optional(t.String()),
        category: t.Optional(t.String()),
        date: t.Optional(t.String()),
      }),
    }
  )

  // Get single task
  .get("/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const task = await db.task.findFirst({
      where: { id: params.id, userId: user.id },
    });

    if (!task) return authError(404, "Task not found");

    return { task };
  })

  // Create task
  .post(
    "/",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      // Calculate XP based on priority
      const xpReward = body.xpReward ?? calculateXpReward(body.priority);

      const task = await db.task.create({
        data: {
          userId: user.id,
          title: body.title,
          description: body.description,
          category: body.category ?? "General",
          priority: body.priority ?? "MEDIUM",
          status: "PENDING",
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
          dueAt: body.dueAt ? new Date(body.dueAt) : null,
          estimatedMinutes: body.estimatedMinutes,
          xpReward,
          snoozeCount: 0,
          rescheduleCount: 0,
        },
      });

      return { task };
    },
    { body: createTaskSchema }
  )

  // Update task
  .patch(
    "/:id",
    async ({ user, authError, params, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const existing = await db.task.findFirst({
        where: { id: params.id, userId: user.id },
      });

      if (!existing) return authError(404, "Task not found");

      const task = await db.task.update({
        where: { id: params.id },
        data: {
          ...body,
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
          dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
        },
      });

      return { task };
    },
    { body: updateTaskSchema }
  )

  // Complete task
  .post("/:id/complete", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const existing = await db.task.findFirst({
      where: { id: params.id, userId: user.id },
    });

    if (!existing) return authError(404, "Task not found");

    // Check if task is blocked
    if (existing.status === "BLOCKED" && existing.dependsOnId) {
      const blocker = await db.task.findUnique({
        where: { id: existing.dependsOnId },
      });
      if (blocker && blocker.status !== "COMPLETED") {
        return authError(400, "Cannot complete - blocked by another task");
      }
    }

    // Update task status
    const task = await db.task.update({
      where: { id: params.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    // Unblock tasks that depend on this one
    const unblockedTasks = await db.task.updateMany({
      where: {
        userId: user.id,
        dependsOnId: params.id,
        status: "BLOCKED",
      },
      data: {
        status: "PENDING",
      },
    });

    // Award XP
    await db.xpTransaction.create({
      data: {
        userId: user.id,
        amount: task.xpReward,
        source: "TASK_COMPLETION",
        sourceId: task.id,
        description: `Completed: ${task.title}`,
      },
    });

    // Update user stats
    await db.userStats.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        totalXp: task.xpReward,
        tasksCompleted: 1,
        currentStreak: 1,
        longestStreak: 1,
      },
      update: {
        totalXp: { increment: task.xpReward },
        tasksCompleted: { increment: 1 },
      },
    });

    // Update time slot score for decision engine
    if (task.scheduledAt) {
      await updateTimeSlotScore(user.id, task.category, task.scheduledAt, "completed");
    }

    return { task, xpEarned: task.xpReward, unblockedCount: unblockedTasks.count };
  })

  // Snooze task
  .post(
    "/:id/snooze",
    async ({ user, authError, params, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const existing = await db.task.findFirst({
        where: { id: params.id, userId: user.id },
      });

      if (!existing) return authError(404, "Task not found");

      const newSnoozeCount = existing.snoozeCount + 1;
      const newStatus = newSnoozeCount >= 3 ? "ESCALATED" : "SNOOZED";

      // Calculate new scheduled time (default: 2-4 hours later)
      const snoozeMinutes = body.minutes ?? (newSnoozeCount === 1 ? 120 : 240);
      const newScheduledAt = new Date(Date.now() + snoozeMinutes * 60 * 1000);

      const task = await db.task.update({
        where: { id: params.id },
        data: {
          status: newStatus,
          snoozeCount: newSnoozeCount,
          scheduledAt: body.rescheduleAt ? new Date(body.rescheduleAt) : newScheduledAt,
          rescheduleCount: { increment: 1 },
        },
      });

      // Update time slot score negatively
      if (existing.scheduledAt) {
        await updateTimeSlotScore(user.id, existing.category, existing.scheduledAt, "snoozed");
      }

      return { task, escalated: newStatus === "ESCALATED" };
    },
    {
      body: t.Object({
        minutes: t.Optional(t.Number({ minimum: 15 })),
        rescheduleAt: t.Optional(t.String({ format: "date-time" })),
      }),
    }
  )

  // Delete task
  .delete("/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const existing = await db.task.findFirst({
      where: { id: params.id, userId: user.id },
    });

    if (!existing) return authError(404, "Task not found");

    await db.task.delete({ where: { id: params.id } });

    return { success: true };
  })

  // === Task Dependencies ===

  // Set task dependency (this task depends on another)
  .post(
    "/:id/dependency",
    async ({ user, authError, params, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const task = await db.task.findFirst({
        where: { id: params.id, userId: user.id },
      });

      if (!task) return authError(404, "Task not found");

      // If setting a task dependency
      if (body.dependsOnId) {
        const blocker = await db.task.findFirst({
          where: { id: body.dependsOnId, userId: user.id },
        });

        if (!blocker) return authError(404, "Blocking task not found");

        // Prevent circular dependencies
        if (blocker.dependsOnId === task.id) {
          return authError(400, "Circular dependency detected");
        }

        // Update task to depend on blocker
        const updated = await db.task.update({
          where: { id: params.id },
          data: {
            dependsOnId: body.dependsOnId,
            status: blocker.status !== "COMPLETED" ? "BLOCKED" : task.status,
            blockReason: body.reason || `Waiting on: ${blocker.title}`,
          },
          include: { dependsOn: true },
        });

        return { task: updated };
      }

      // If setting an external block reason
      if (body.reason) {
        const updated = await db.task.update({
          where: { id: params.id },
          data: {
            status: "BLOCKED",
            blockReason: body.reason,
          },
        });

        return { task: updated };
      }

      return authError(400, "Must provide dependsOnId or reason");
    },
    {
      body: t.Object({
        dependsOnId: t.Optional(t.String()),
        reason: t.Optional(t.String({ maxLength: 500 })),
      }),
    }
  )

  // Remove task dependency
  .delete("/:id/dependency", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const task = await db.task.findFirst({
      where: { id: params.id, userId: user.id },
    });

    if (!task) return authError(404, "Task not found");

    const updated = await db.task.update({
      where: { id: params.id },
      data: {
        dependsOnId: null,
        blockReason: null,
        status: task.status === "BLOCKED" ? "PENDING" : task.status,
      },
    });

    return { task: updated };
  })

  // Get tasks blocked by this task
  .get("/:id/blocked-tasks", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const task = await db.task.findFirst({
      where: { id: params.id, userId: user.id },
    });

    if (!task) return authError(404, "Task not found");

    const blockedTasks = await db.task.findMany({
      where: {
        userId: user.id,
        dependsOnId: params.id,
      },
      orderBy: { priority: "desc" },
    });

    return { blockedTasks };
  })

  // Get all blocked tasks
  .get("/blocked", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const blockedTasks = await db.task.findMany({
      where: {
        userId: user.id,
        status: "BLOCKED",
      },
      include: {
        dependsOn: {
          select: { id: true, title: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { blockedTasks };
  });

// Helper functions
function calculateXpReward(priority?: string): number {
  switch (priority) {
    case "URGENT":
      return 50;
    case "HIGH":
      return 30;
    case "MEDIUM":
      return 20;
    case "LOW":
      return 10;
    default:
      return 20;
  }
}

async function updateTimeSlotScore(
  userId: string,
  category: string,
  scheduledAt: Date,
  action: "completed" | "snoozed" | "ignored"
) {
  const hour = scheduledAt.getHours();
  const timeSlot = getTimeSlot(hour);

  const existing = await db.timeSlotScore.findFirst({
    where: { userId, category, timeSlot },
  });

  if (existing) {
    await db.timeSlotScore.update({
      where: { id: existing.id },
      data: {
        totalAttempts: { increment: 1 },
        completions: action === "completed" ? { increment: 1 } : undefined,
        snoozes: action === "snoozed" ? { increment: 1 } : undefined,
        ignores: action === "ignored" ? { increment: 1 } : undefined,
      },
    });
  } else {
    await db.timeSlotScore.create({
      data: {
        userId,
        category,
        timeSlot,
        totalAttempts: 1,
        completions: action === "completed" ? 1 : 0,
        snoozes: action === "snoozed" ? 1 : 0,
        ignores: action === "ignored" ? 1 : 0,
      },
    });
  }
}

function getTimeSlot(hour: number): string {
  if (hour >= 6 && hour < 8) return "EARLY_MORNING";
  if (hour >= 8 && hour < 10) return "MORNING";
  if (hour >= 10 && hour < 12) return "LATE_MORNING";
  if (hour >= 12 && hour < 14) return "MIDDAY";
  if (hour >= 14 && hour < 16) return "AFTERNOON";
  if (hour >= 16 && hour < 18) return "LATE_AFTERNOON";
  if (hour >= 18 && hour < 20) return "EVENING";
  if (hour >= 20 && hour < 22) return "LATE_EVENING";
  return "NIGHT";
}
