import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

const logSleepSchema = t.Object({
  sleepStart: t.String({ format: "date-time" }),
  sleepEnd: t.String({ format: "date-time" }),
  quality: t.Number({ minimum: 1, maximum: 5 }),
  notes: t.Optional(t.String({ maxLength: 500 })),
});

export const sleepRoutes = new Elysia({ prefix: "/sleep" })
  .use(authPlugin)

  // Log sleep
  .post(
    "/",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const sleepStart = new Date(body.sleepStart);
      const sleepEnd = new Date(body.sleepEnd);
      const duration = Math.floor((sleepEnd.getTime() - sleepStart.getTime()) / 60000);

      if (duration < 0) {
        return authError(400, "Sleep end must be after sleep start");
      }

      if (duration > 24 * 60) {
        return authError(400, "Sleep duration cannot exceed 24 hours");
      }

      const log = await db.sleepLog.create({
        data: {
          userId: user.id,
          sleepStart,
          sleepEnd,
          duration,
          quality: body.quality,
          notes: body.notes,
        },
      });

      return { log };
    },
    { body: logSleepSchema }
  )

  // Get sleep logs
  .get(
    "/",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const days = query.days || 7;
      const since = new Date();
      since.setDate(since.getDate() - days);

      const logs = await db.sleepLog.findMany({
        where: {
          userId: user.id,
          sleepStart: { gte: since },
        },
        orderBy: { sleepStart: "desc" },
      });

      return { logs };
    },
    {
      query: t.Object({
        days: t.Optional(t.Number({ minimum: 1, maximum: 90 })),
      }),
    }
  )

  // Get sleep stats
  .get("/stats", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [recentLogs, monthlyLogs] = await Promise.all([
      db.sleepLog.findMany({
        where: {
          userId: user.id,
          sleepStart: { gte: sevenDaysAgo },
        },
      }),
      db.sleepLog.findMany({
        where: {
          userId: user.id,
          sleepStart: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    // Calculate averages
    const calcAvg = (logs: typeof recentLogs) => {
      if (logs.length === 0) return { duration: 0, quality: 0 };
      const totalDuration = logs.reduce((sum, l) => sum + l.duration, 0);
      const totalQuality = logs.reduce((sum, l) => sum + l.quality, 0);
      return {
        duration: Math.round(totalDuration / logs.length),
        quality: Math.round((totalQuality / logs.length) * 10) / 10,
      };
    };

    const weekAvg = calcAvg(recentLogs);
    const monthAvg = calcAvg(monthlyLogs);

    // Sleep debt calculation (assuming 8 hours = 480 min is optimal)
    const optimalSleep = 480;
    const weekDebt = recentLogs.reduce((debt, l) => debt + Math.max(0, optimalSleep - l.duration), 0);

    // Find patterns
    const sleepTimes = recentLogs.map((l) => new Date(l.sleepStart).getHours());
    const wakeTimes = recentLogs.map((l) => new Date(l.sleepEnd).getHours());
    const avgSleepTime = sleepTimes.length > 0 ? Math.round(sleepTimes.reduce((a, b) => a + b, 0) / sleepTimes.length) : null;
    const avgWakeTime = wakeTimes.length > 0 ? Math.round(wakeTimes.reduce((a, b) => a + b, 0) / wakeTimes.length) : null;

    // Quality trend (comparing recent week to previous week)
    const previousWeek = monthlyLogs.filter((l) => {
      const logDate = new Date(l.sleepStart);
      return logDate < sevenDaysAgo;
    });
    const prevAvg = calcAvg(previousWeek);
    const qualityTrend = weekAvg.quality - prevAvg.quality;

    return {
      week: {
        logs: recentLogs.length,
        avgDurationMinutes: weekAvg.duration,
        avgDurationHours: Math.round((weekAvg.duration / 60) * 10) / 10,
        avgQuality: weekAvg.quality,
        sleepDebtMinutes: weekDebt,
      },
      month: {
        logs: monthlyLogs.length,
        avgDurationMinutes: monthAvg.duration,
        avgDurationHours: Math.round((monthAvg.duration / 60) * 10) / 10,
        avgQuality: monthAvg.quality,
      },
      patterns: {
        avgBedtime: avgSleepTime !== null ? `${avgSleepTime.toString().padStart(2, "0")}:00` : null,
        avgWakeTime: avgWakeTime !== null ? `${avgWakeTime.toString().padStart(2, "0")}:00` : null,
      },
      trends: {
        qualityChange: qualityTrend,
        qualityDirection: qualityTrend > 0.2 ? "improving" : qualityTrend < -0.2 ? "declining" : "stable",
      },
      recommendations: getRecommendations(weekAvg, weekDebt, avgSleepTime),
    };
  })

  // Get last night's sleep
  .get("/last-night", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(18, 0, 0, 0); // 6 PM yesterday

    const log = await db.sleepLog.findFirst({
      where: {
        userId: user.id,
        sleepStart: { gte: yesterday },
      },
      orderBy: { sleepStart: "desc" },
    });

    if (!log) {
      return { logged: false, log: null };
    }

    return {
      logged: true,
      log,
      duration: {
        hours: Math.floor(log.duration / 60),
        minutes: log.duration % 60,
      },
    };
  })

  // Delete sleep log
  .delete("/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const log = await db.sleepLog.findUnique({
      where: { id: params.id },
    });

    if (!log) return authError(404, "Sleep log not found");
    if (log.userId !== user.id) return authError(403, "Access denied");

    await db.sleepLog.delete({ where: { id: params.id } });

    return { success: true };
  });

// Helper function for recommendations
function getRecommendations(
  weekAvg: { duration: number; quality: number },
  sleepDebt: number,
  avgBedtime: number | null
): string[] {
  const recs: string[] = [];

  if (weekAvg.duration < 420) {
    // Less than 7 hours
    recs.push("Try to get at least 7-8 hours of sleep per night");
  }

  if (sleepDebt > 120) {
    // More than 2 hours debt
    recs.push("Consider going to bed 30 minutes earlier to reduce sleep debt");
  }

  if (weekAvg.quality < 3) {
    recs.push("Limit screen time 1 hour before bed to improve sleep quality");
    recs.push("Keep your bedroom cool and dark for better rest");
  }

  if (avgBedtime !== null && avgBedtime > 0 && avgBedtime < 6) {
    // After midnight
    recs.push("Try to maintain a consistent sleep schedule by going to bed before midnight");
  }

  if (recs.length === 0) {
    recs.push("Great sleep habits! Keep maintaining your consistent schedule");
  }

  return recs;
}
