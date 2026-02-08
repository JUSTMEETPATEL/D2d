import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

// Burnout thresholds
const BURNOUT_THRESHOLDS = {
  COMPLETION_DROP: 20, // >20% drop week-over-week
  HIGH_SNOOZE_RATE: 40, // >40% tasks snoozed
  LOW_ENERGY_STREAK: 3, // 3+ days with energy <3
  HIGH_ESCALATION_RATE: 30, // >30% tasks escalated
};

// Break durations in minutes
const BREAK_DURATIONS = {
  SHORT: 5,
  MEDIUM: 15,
  LONG: 30,
  RECOVERY: 60,
};

export const wellbeingRoutes = new Elysia({ prefix: "/wellbeing" })
  .use(authPlugin)

  // Get burnout risk status
  .get("/status", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    // Get this week's tasks
    const thisWeekTasks = await db.task.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: oneWeekAgo },
      },
      select: { status: true },
    });

    // Get last week's tasks
    const lastWeekTasks = await db.task.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: twoWeeksAgo, lt: oneWeekAgo },
      },
      select: { status: true },
    });

    // Calculate completion rates
    const thisWeekCompleted = thisWeekTasks.filter((t) => t.status === "COMPLETED").length;
    const thisWeekTotal = thisWeekTasks.length;
    const thisWeekRate = thisWeekTotal > 0 ? (thisWeekCompleted / thisWeekTotal) * 100 : 0;

    const lastWeekCompleted = lastWeekTasks.filter((t) => t.status === "COMPLETED").length;
    const lastWeekTotal = lastWeekTasks.length;
    const lastWeekRate = lastWeekTotal > 0 ? (lastWeekCompleted / lastWeekTotal) * 100 : 0;

    // Calculate snooze rate
    const snoozedCount = thisWeekTasks.filter((t) => t.status === "SNOOZED").length;
    const snoozeRate = thisWeekTotal > 0 ? (snoozedCount / thisWeekTotal) * 100 : 0;

    // Calculate escalation rate
    const escalatedCount = thisWeekTasks.filter((t) => t.status === "ESCALATED").length;
    const escalationRate = thisWeekTotal > 0 ? (escalatedCount / thisWeekTotal) * 100 : 0;

    // Get recent energy logs
    const recentEnergy = await db.energyLog.findMany({
      where: {
        userId: user.id,
        loggedAt: { gte: threeDaysAgo },
      },
      orderBy: { loggedAt: "desc" },
    });

    const lowEnergyDays = recentEnergy.filter((e) => e.level < 3).length;

    // Check for active recovery mode
    const activeRecovery = await db.recoveryMode.findFirst({
      where: {
        userId: user.id,
        active: true,
        endsAt: { gte: now },
      },
    });

    // Assess burnout signals
    const signals: Array<{ type: string; value: number; threshold: number; message: string }> = [];
    let riskScore = 0;

    // Completion drop
    const completionDrop = lastWeekRate - thisWeekRate;
    if (completionDrop > BURNOUT_THRESHOLDS.COMPLETION_DROP) {
      signals.push({
        type: "COMPLETION_DROP",
        value: completionDrop,
        threshold: BURNOUT_THRESHOLDS.COMPLETION_DROP,
        message: `Your completion rate dropped ${completionDrop.toFixed(0)}% this week`,
      });
      riskScore += 25;
    }

    // High snooze rate
    if (snoozeRate > BURNOUT_THRESHOLDS.HIGH_SNOOZE_RATE) {
      signals.push({
        type: "HIGH_SNOOZE_RATE",
        value: snoozeRate,
        threshold: BURNOUT_THRESHOLDS.HIGH_SNOOZE_RATE,
        message: `You're snoozing ${snoozeRate.toFixed(0)}% of your tasks`,
      });
      riskScore += 20;
    }

    // High escalation rate
    if (escalationRate > BURNOUT_THRESHOLDS.HIGH_ESCALATION_RATE) {
      signals.push({
        type: "HIGH_ESCALATION_RATE",
        value: escalationRate,
        threshold: BURNOUT_THRESHOLDS.HIGH_ESCALATION_RATE,
        message: `${escalationRate.toFixed(0)}% of tasks have escalated`,
      });
      riskScore += 20;
    }

    // Low energy streak
    if (lowEnergyDays >= BURNOUT_THRESHOLDS.LOW_ENERGY_STREAK) {
      signals.push({
        type: "LOW_ENERGY_STREAK",
        value: lowEnergyDays,
        threshold: BURNOUT_THRESHOLDS.LOW_ENERGY_STREAK,
        message: `Low energy for ${lowEnergyDays} days in a row`,
      });
      riskScore += 35;
    }

    // Determine risk level
    let riskLevel: "low" | "medium" | "high" | "critical" = "low";
    if (riskScore >= 60) riskLevel = "critical";
    else if (riskScore >= 40) riskLevel = "high";
    else if (riskScore >= 20) riskLevel = "medium";

    // Store signals if any
    if (signals.length > 0) {
      await Promise.all(
        signals.map((s) =>
          db.burnoutSignal.create({
            data: {
              userId: user.id,
              signalType: s.type as "COMPLETION_DROP" | "HIGH_SNOOZE_RATE" | "LOW_ENERGY_STREAK" | "TASK_DELAY_PATTERN" | "RECOVERY_SUGGESTED",
              value: s.value,
              threshold: s.threshold,
              message: s.message,
            },
          })
        )
      );
    }

    return {
      riskScore,
      riskLevel,
      signals,
      stats: {
        thisWeekCompletionRate: thisWeekRate,
        lastWeekCompletionRate: lastWeekRate,
        snoozeRate,
        escalationRate,
        lowEnergyDays,
      },
      activeRecovery: activeRecovery
        ? {
            endsAt: activeRecovery.endsAt,
            reducedTaskTarget: activeRecovery.reducedTaskTarget,
          }
        : null,
      recommendations:
        riskLevel === "critical"
          ? ["Consider enabling Recovery Mode for lighter scheduling", "Focus on just 2-3 essential tasks per day", "Prioritize sleep and rest"]
          : riskLevel === "high"
            ? ["Try reducing your daily task count", "Schedule more breaks between tasks", "Log your energy levels to find patterns"]
            : ["You're doing well! Keep up the balanced approach"],
    };
  })

  // Enable recovery mode
  .post(
    "/recovery-mode",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      // Check if already in recovery
      const existing = await db.recoveryMode.findFirst({
        where: {
          userId: user.id,
          active: true,
          endsAt: { gte: new Date() },
        },
      });

      if (existing) {
        return authError(400, "Already in recovery mode");
      }

      const days = body.days || 3;
      const endsAt = new Date();
      endsAt.setDate(endsAt.getDate() + days);

      const recovery = await db.recoveryMode.create({
        data: {
          userId: user.id,
          endsAt,
          reason: body.reason,
          reducedTaskTarget: body.reducedTarget || 3,
        },
      });

      return {
        recovery,
        message: `Recovery mode enabled for ${days} days. Focus on just ${recovery.reducedTaskTarget} tasks per day.`,
      };
    },
    {
      body: t.Object({
        days: t.Optional(t.Number({ minimum: 1, maximum: 14 })),
        reason: t.Optional(t.String({ maxLength: 500 })),
        reducedTarget: t.Optional(t.Number({ minimum: 1, maximum: 5 })),
      }),
    }
  )

  // End recovery mode early
  .post("/recovery-mode/end", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const active = await db.recoveryMode.findFirst({
      where: {
        userId: user.id,
        active: true,
      },
    });

    if (!active) return authError(404, "No active recovery mode");

    await db.recoveryMode.update({
      where: { id: active.id },
      data: {
        active: false,
        completedAt: new Date(),
      },
    });

    return { success: true, message: "Recovery mode ended" };
  })

  // Get break suggestion
  .get("/break-suggestion", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Get today's completed tasks
    const completedToday = await db.task.count({
      where: {
        userId: user.id,
        completedAt: { gte: today },
      },
    });

    // Get last break
    const lastBreak = await db.breakLog.findFirst({
      where: { userId: user.id },
      orderBy: { loggedAt: "desc" },
    });

    const minutesSinceBreak = lastBreak
      ? Math.floor((now.getTime() - new Date(lastBreak.loggedAt).getTime()) / 60000)
      : 999;

    // Note: Could add focus session context for more intelligent break suggestions
    // const lastFocus = await db.focusSession.findFirst({ where: { userId: user.id } });

    // Decision logic
    let suggestion: {
      needed: boolean;
      type: "SHORT" | "MEDIUM" | "LONG";
      duration: number;
      reason: string;
      activities: string[];
    };

    if (completedToday >= 5 && minutesSinceBreak > 30) {
      suggestion = {
        needed: true,
        type: "MEDIUM",
        duration: BREAK_DURATIONS.MEDIUM,
        reason: `You've completed ${completedToday} tasks today - time for a proper break!`,
        activities: ["Take a short walk", "Stretch and hydrate", "Step away from screens"],
      };
    } else if (minutesSinceBreak > 90) {
      suggestion = {
        needed: true,
        type: "SHORT",
        duration: BREAK_DURATIONS.SHORT,
        reason: "It's been over 90 minutes - a quick break will boost focus",
        activities: ["Stand and stretch", "Drink some water", "Look away from screen for 20 seconds"],
      };
    } else if (completedToday >= 8) {
      suggestion = {
        needed: true,
        type: "LONG",
        duration: BREAK_DURATIONS.LONG,
        reason: "Excellent productivity! Take a longer break to recharge",
        activities: ["Go for a walk outside", "Have a healthy snack", "Meditate for 10 minutes"],
      };
    } else {
      suggestion = {
        needed: false,
        type: "SHORT",
        duration: BREAK_DURATIONS.SHORT,
        reason: "No break needed right now - keep up the momentum!",
        activities: [],
      };
    }

    return {
      suggestion,
      stats: {
        tasksCompletedToday: completedToday,
        minutesSinceLastBreak: minutesSinceBreak,
      },
    };
  })

  // Log a break
  .post(
    "/breaks",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const breakLog = await db.breakLog.create({
        data: {
          userId: user.id,
          breakType: body.type,
          duration: body.duration || BREAK_DURATIONS[body.type],
          activity: body.activity,
          triggeredBy: body.triggeredBy || "user",
        },
      });

      return { breakLog };
    },
    {
      body: t.Object({
        type: t.Enum({ SHORT: "SHORT", MEDIUM: "MEDIUM", LONG: "LONG", RECOVERY: "RECOVERY" }),
        duration: t.Optional(t.Number({ minimum: 1, maximum: 120 })),
        activity: t.Optional(t.String({ maxLength: 100 })),
        triggeredBy: t.Optional(t.String()),
      }),
    }
  )

  // Get break history
  .get(
    "/breaks",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const days = query.days || 7;
      const since = new Date();
      since.setDate(since.getDate() - days);

      const breaks = await db.breakLog.findMany({
        where: {
          userId: user.id,
          loggedAt: { gte: since },
        },
        orderBy: { loggedAt: "desc" },
      });

      const totalMinutes = breaks.reduce((sum, b) => sum + b.duration, 0);

      return {
        breaks,
        stats: {
          totalBreaks: breaks.length,
          totalMinutes,
          averagePerDay: Math.round(totalMinutes / days),
        },
      };
    },
    {
      query: t.Object({
        days: t.Optional(t.Number({ minimum: 1, maximum: 30 })),
      }),
    }
  )

  // Acknowledge burnout signal
  .post("/:signalId/acknowledge", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const signal = await db.burnoutSignal.findUnique({
      where: { id: params.signalId },
    });

    if (!signal) return authError(404, "Signal not found");
    if (signal.userId !== user.id) return authError(403, "Access denied");

    await db.burnoutSignal.update({
      where: { id: params.signalId },
      data: {
        acknowledged: true,
        acknowledgedAt: new Date(),
      },
    });

    return { success: true };
  })

  // Get unacknowledged signals
  .get("/signals", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const signals = await db.burnoutSignal.findMany({
      where: {
        userId: user.id,
        acknowledged: false,
      },
      orderBy: { createdAt: "desc" },
    });

    return { signals };
  });
