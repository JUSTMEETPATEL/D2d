import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

const MOOD_EMOJIS = ["😔", "😕", "😐", "🙂", "😊"] as const;

const logMoodSchema = t.Object({
  level: t.Number({ minimum: 1, maximum: 5 }),
  note: t.Optional(t.String({ maxLength: 500 })),
});

export const moodRoutes = new Elysia({ prefix: "/mood" })
  .use(authPlugin)

  // Log mood
  .post(
    "/",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const emoji = MOOD_EMOJIS[body.level - 1];

      const log = await db.moodLog.create({
        data: {
          userId: user.id,
          level: body.level,
          emoji,
          note: body.note,
        },
      });

      return { log };
    },
    { body: logMoodSchema }
  )

  // Get today's mood
  .get("/today", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const logs = await db.moodLog.findMany({
      where: {
        userId: user.id,
        loggedAt: { gte: today },
      },
      orderBy: { loggedAt: "desc" },
    });

    if (logs.length === 0) {
      return { logged: false, logs: [] };
    }

    const avgMood = logs.reduce((sum, l) => sum + l.level, 0) / logs.length;

    return {
      logged: true,
      logs,
      averageMood: Math.round(avgMood * 10) / 10,
      latestMood: logs[0],
    };
  })

  // Get mood history
  .get(
    "/history",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const days = query.days || 7;
      const since = new Date();
      since.setDate(since.getDate() - days);

      const logs = await db.moodLog.findMany({
        where: {
          userId: user.id,
          loggedAt: { gte: since },
        },
        orderBy: { loggedAt: "desc" },
      });

      // Group by day
      const byDay: Record<string, { logs: typeof logs; avg: number }> = {};
      logs.forEach((log) => {
        const day = log.loggedAt.toISOString().split("T")[0];
        if (!byDay[day]) byDay[day] = { logs: [], avg: 0 };
        byDay[day].logs.push(log);
      });

      // Calculate daily averages
      Object.keys(byDay).forEach((day) => {
        const dayLogs = byDay[day].logs;
        byDay[day].avg = dayLogs.reduce((sum, l) => sum + l.level, 0) / dayLogs.length;
      });

      return { logs, byDay };
    },
    {
      query: t.Object({
        days: t.Optional(t.Number({ minimum: 1, maximum: 90 })),
      }),
    }
  )

  // Get mood stats
  .get("/stats", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [recentLogs, monthlyLogs] = await Promise.all([
      db.moodLog.findMany({
        where: {
          userId: user.id,
          loggedAt: { gte: sevenDaysAgo },
        },
      }),
      db.moodLog.findMany({
        where: {
          userId: user.id,
          loggedAt: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    // Calculate averages
    const calcStats = (logs: typeof recentLogs) => {
      if (logs.length === 0) return { avg: 0, high: 0, low: 0 };
      const levels = logs.map((l) => l.level);
      return {
        avg: Math.round((levels.reduce((a, b) => a + b, 0) / levels.length) * 10) / 10,
        high: Math.max(...levels),
        low: Math.min(...levels),
      };
    };

    const weekStats = calcStats(recentLogs);
    const monthStats = calcStats(monthlyLogs);

    // Distribution
    const distribution = [0, 0, 0, 0, 0]; // 1-5
    recentLogs.forEach((l) => {
      distribution[l.level - 1]++;
    });

    // Trend
    const previousWeek = monthlyLogs.filter((l) => {
      const logDate = new Date(l.loggedAt);
      return logDate < sevenDaysAgo;
    });
    const prevStats = calcStats(previousWeek);
    const trend = weekStats.avg - prevStats.avg;

    // Time patterns
    const byHour: Record<number, { total: number; sum: number }> = {};
    recentLogs.forEach((l) => {
      const hour = new Date(l.loggedAt).getHours();
      if (!byHour[hour]) byHour[hour] = { total: 0, sum: 0 };
      byHour[hour].total++;
      byHour[hour].sum += l.level;
    });

    const hourlyAvg = Object.entries(byHour).map(([hour, data]) => ({
      hour: parseInt(hour),
      avgMood: Math.round((data.sum / data.total) * 10) / 10,
    }));

    // Find best and worst times
    const sortedHours = hourlyAvg.sort((a, b) => b.avgMood - a.avgMood);
    const bestTime = sortedHours[0]?.hour;
    const worstTime = sortedHours[sortedHours.length - 1]?.hour;

    return {
      week: {
        logs: recentLogs.length,
        average: weekStats.avg,
        highest: weekStats.high,
        lowest: weekStats.low,
        distribution,
      },
      month: {
        logs: monthlyLogs.length,
        average: monthStats.avg,
      },
      trend: {
        change: trend,
        direction: trend > 0.2 ? "improving" : trend < -0.2 ? "declining" : "stable",
      },
      patterns: {
        bestTimeOfDay: bestTime !== undefined ? `${bestTime.toString().padStart(2, "0")}:00` : null,
        worstTimeOfDay: worstTime !== undefined ? `${worstTime.toString().padStart(2, "0")}:00` : null,
        hourlyBreakdown: hourlyAvg,
      },
      insights: generateInsights(weekStats, trend, recentLogs.length),
    };
  })

  // Get mood correlation with tasks/energy
  .get("/correlations", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get mood, tasks, and energy data
    const [moodLogs, tasks, energyLogs] = await Promise.all([
      db.moodLog.findMany({
        where: { userId: user.id, loggedAt: { gte: sevenDaysAgo } },
      }),
      db.task.findMany({
        where: { userId: user.id, createdAt: { gte: sevenDaysAgo } },
        select: { status: true, completedAt: true },
      }),
      db.energyLog.findMany({
        where: { userId: user.id, loggedAt: { gte: sevenDaysAgo } },
      }),
    ]);

    // Group by day
    const byDay: Record<
      string,
      {
        mood: number[];
        tasksCompleted: number;
        energy: number[];
      }
    > = {};

    moodLogs.forEach((l) => {
      const day = l.loggedAt.toISOString().split("T")[0];
      if (!byDay[day]) byDay[day] = { mood: [], tasksCompleted: 0, energy: [] };
      byDay[day].mood.push(l.level);
    });

    tasks.forEach((t) => {
      if (t.status === "COMPLETED" && t.completedAt) {
        const day = t.completedAt.toISOString().split("T")[0];
        if (byDay[day]) byDay[day].tasksCompleted++;
      }
    });

    energyLogs.forEach((e) => {
      const day = e.loggedAt.toISOString().split("T")[0];
      if (byDay[day]) byDay[day].energy.push(e.level);
    });

    // Calculate correlations (simplified)
    const days = Object.values(byDay);
    const moodAvgs = days.map((d) => (d.mood.length > 0 ? d.mood.reduce((a, b) => a + b, 0) / d.mood.length : 0));
    const taskCounts = days.map((d) => d.tasksCompleted);
    const energyAvgs = days.map((d) => (d.energy.length > 0 ? d.energy.reduce((a, b) => a + b, 0) / d.energy.length : 0));

    return {
      correlations: {
        moodAndProductivity: calculateCorrelation(moodAvgs, taskCounts),
        moodAndEnergy: calculateCorrelation(moodAvgs, energyAvgs),
      },
      insights: [
        moodAvgs.length > 3 && calculateCorrelation(moodAvgs, taskCounts) > 0.5
          ? "Higher mood correlates with more tasks completed"
          : null,
        moodAvgs.length > 3 && calculateCorrelation(moodAvgs, energyAvgs) > 0.5 ? "Your mood and energy levels tend to move together" : null,
      ].filter(Boolean),
    };
  });

// Helper functions
function generateInsights(stats: { avg: number }, trend: number, logCount: number): string[] {
  const insights: string[] = [];

  if (logCount < 3) {
    insights.push("Log your mood more often to get personalized insights");
    return insights;
  }

  if (stats.avg >= 4) {
    insights.push("You've been in a great mood this week! Keep doing what works");
  } else if (stats.avg < 3) {
    insights.push("Your mood has been lower than usual. Consider taking breaks or talking to someone");
  }

  if (trend > 0.5) {
    insights.push("Your mood is trending upward - great progress!");
  } else if (trend < -0.5) {
    insights.push("Your mood has been declining. Try scheduling activities you enjoy");
  }

  return insights;
}

function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 3) return 0;

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
  const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);
  const sumY2 = y.reduce((total, yi) => total + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100) / 100;
}
