import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

export const focusRoutes = new Elysia({ prefix: "/focus" })
  .use(authPlugin)

  // Start a focus session
  .post(
    "/start",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      // Check if there's already an active session
      const activeSession = await db.focusSession.findFirst({
        where: {
          userId: user.id,
          endedAt: null,
        },
      });

      if (activeSession) {
        return authError(400, "You already have an active focus session. End it first.");
      }

      // If taskId provided, verify task exists and belongs to user
      if (body.taskId) {
        const task = await db.task.findUnique({
          where: { id: body.taskId },
        });
        if (!task || task.userId !== user.id) {
          return authError(404, "Task not found");
        }

        // Update task status to IN_PROGRESS
        await db.task.update({
          where: { id: body.taskId },
          data: { status: "IN_PROGRESS" },
        });
      }

      const session = await db.focusSession.create({
        data: {
          userId: user.id,
          taskId: body.taskId,
          plannedMinutes: body.duration || 25,
        },
      });

      return {
        session,
        message: `Focus session started for ${session.plannedMinutes} minutes`,
        endsAt: new Date(session.startedAt.getTime() + session.plannedMinutes * 60000),
      };
    },
    {
      body: t.Object({
        taskId: t.Optional(t.String()),
        duration: t.Optional(t.Number({ minimum: 5, maximum: 120 })),
      }),
    }
  )

  // Get current active session
  .get("/current", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const session = await db.focusSession.findFirst({
      where: {
        userId: user.id,
        endedAt: null,
      },
    });

    if (!session) {
      return { active: false, session: null };
    }

    const now = new Date();
    const startTime = new Date(session.startedAt);
    const elapsedMinutes = Math.floor((now.getTime() - startTime.getTime()) / 60000);
    const remainingMinutes = Math.max(0, session.plannedMinutes - elapsedMinutes);

    return {
      active: true,
      session,
      elapsed: elapsedMinutes,
      remaining: remainingMinutes,
      isOvertime: remainingMinutes === 0,
    };
  })

  // End focus session
  .post(
    "/end",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const session = await db.focusSession.findFirst({
        where: {
          userId: user.id,
          endedAt: null,
        },
      });

      if (!session) {
        return authError(404, "No active focus session");
      }

      const now = new Date();
      const startTime = new Date(session.startedAt);
      const actualMinutes = Math.floor((now.getTime() - startTime.getTime()) / 60000);

      // Determine completion status
      const completed = body.completed ?? actualMinutes >= session.plannedMinutes * 0.8; // 80% threshold
      
      const feedback = body.feedback || (
        completed ? "completed" : 
        actualMinutes < session.plannedMinutes * 0.5 ? "interrupted" : "partial"
      );

      const updatedSession = await db.focusSession.update({
        where: { id: session.id },
        data: {
          endedAt: now,
          actualMinutes,
          completed,
          feedback,
        },
      });

      // Award XP for completed sessions
      let xpAwarded = 0;
      if (completed) {
        xpAwarded = Math.min(50, Math.floor(actualMinutes / 5) * 5); // 5 XP per 5 min, max 50

        await db.xpTransaction.create({
          data: {
            userId: user.id,
            amount: xpAwarded,
            source: "TASK_COMPLETION",
            sourceId: session.id,
            description: `Focus session completed (${actualMinutes} min)`,
          },
        });

        await db.userStats.upsert({
          where: { userId: user.id },
          create: { userId: user.id, totalXp: xpAwarded },
          update: { totalXp: { increment: xpAwarded } },
        });
      }

      return {
        session: updatedSession,
        stats: {
          plannedMinutes: session.plannedMinutes,
          actualMinutes,
          completed,
          xpAwarded,
        },
      };
    },
    {
      body: t.Object({
        completed: t.Optional(t.Boolean()),
        feedback: t.Optional(t.String({ maxLength: 100 })),
      }),
    }
  )

  // Extend current session
  .post(
    "/extend",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const session = await db.focusSession.findFirst({
        where: {
          userId: user.id,
          endedAt: null,
        },
      });

      if (!session) {
        return authError(404, "No active focus session");
      }

      const additionalMinutes = body.minutes || 10;
      const newPlanned = session.plannedMinutes + additionalMinutes;

      const updated = await db.focusSession.update({
        where: { id: session.id },
        data: { plannedMinutes: newPlanned },
      });

      return {
        session: updated,
        message: `Session extended by ${additionalMinutes} minutes`,
      };
    },
    {
      body: t.Object({
        minutes: t.Optional(t.Number({ minimum: 5, maximum: 60 })),
      }),
    }
  )

  // Get focus stats
  .get(
    "/stats",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const days = query.days || 7;
      const since = new Date();
      since.setDate(since.getDate() - days);

      const sessions = await db.focusSession.findMany({
        where: {
          userId: user.id,
          startedAt: { gte: since },
          endedAt: { not: null },
        },
        orderBy: { startedAt: "desc" },
      });

      const completedSessions = sessions.filter((s) => s.completed);
      const totalMinutes = sessions.reduce((sum, s) => sum + (s.actualMinutes || 0), 0);
      const completedMinutes = completedSessions.reduce((sum, s) => sum + (s.actualMinutes || 0), 0);

      // Find longest session
      const longestSession = sessions.reduce(
        (max, s) => ((s.actualMinutes || 0) > (max?.actualMinutes || 0) ? s : max),
        null as (typeof sessions)[0] | null
      );

      // Daily breakdown
      const dailyStats: Record<string, { sessions: number; minutes: number }> = {};
      sessions.forEach((s) => {
        const day = new Date(s.startedAt).toISOString().split("T")[0];
        if (!dailyStats[day]) dailyStats[day] = { sessions: 0, minutes: 0 };
        dailyStats[day].sessions++;
        dailyStats[day].minutes += s.actualMinutes || 0;
      });

      // Current streak (consecutive days with at least one focus session)
      const sortedDays = Object.keys(dailyStats).sort().reverse();
      let streak = 0;
      const today = new Date().toISOString().split("T")[0];
      let checkDate = today;

      for (let i = 0; i < sortedDays.length; i++) {
        if (sortedDays[i] === checkDate || sortedDays[i] === getYesterday(checkDate)) {
          streak++;
          checkDate = getYesterday(sortedDays[i]);
        } else {
          break;
        }
      }

      return {
        period: { days, since },
        totals: {
          sessions: sessions.length,
          completedSessions: completedSessions.length,
          completionRate: sessions.length > 0 ? (completedSessions.length / sessions.length) * 100 : 0,
          totalMinutes,
          completedMinutes,
          averageSessionMinutes: sessions.length > 0 ? Math.round(totalMinutes / sessions.length) : 0,
        },
        longestSession: longestSession
          ? {
              minutes: longestSession.actualMinutes,
              date: longestSession.startedAt,
            }
          : null,
        dailyStats,
        currentStreak: streak,
      };
    },
    {
      query: t.Object({
        days: t.Optional(t.Number({ minimum: 1, maximum: 90 })),
      }),
    }
  )

  // Get recent sessions
  .get(
    "/history",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const limit = query.limit || 20;

      const sessions = await db.focusSession.findMany({
        where: {
          userId: user.id,
          endedAt: { not: null },
        },
        orderBy: { startedAt: "desc" },
        take: limit,
      });

      return { sessions };
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
    }
  );

// Helper function
function getYesterday(dateStr: string): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() - 1);
  return date.toISOString().split("T")[0];
}
