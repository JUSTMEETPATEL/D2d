import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

// Time slots for the decision engine
const TIME_SLOTS = [
  { id: "EARLY_MORNING", label: "6-8 AM", start: 6, end: 8 },
  { id: "MORNING", label: "8-10 AM", start: 8, end: 10 },
  { id: "LATE_MORNING", label: "10-12 PM", start: 10, end: 12 },
  { id: "MIDDAY", label: "12-2 PM", start: 12, end: 14 },
  { id: "AFTERNOON", label: "2-4 PM", start: 14, end: 16 },
  { id: "LATE_AFTERNOON", label: "4-6 PM", start: 16, end: 18 },
  { id: "EVENING", label: "6-8 PM", start: 18, end: 20 },
  { id: "LATE_EVENING", label: "8-10 PM", start: 20, end: 22 },
  { id: "NIGHT", label: "10 PM-6 AM", start: 22, end: 6 },
] as const;

export const decisionEngineRoutes = new Elysia({ prefix: "/decision-engine" })
  .use(authPlugin)
  // Get optimal time slot for a task category
  .get(
    "/optimal-slot",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const { category } = query;

      const scores = await db.timeSlotScore.findMany({
        where: {
          userId: user.id,
          ...(category && { category }),
        },
      });

      if (scores.length === 0) {
        // Return default recommendation
        return {
          recommendation: {
            timeSlot: "MORNING",
            label: "8-10 AM",
            confidence: 0,
            reason: "No data yet. Morning slots typically have high success rates.",
          },
          allSlots: TIME_SLOTS.map((slot) => ({
            ...slot,
            score: 0.5,
            attempts: 0,
          })),
        };
      }

      // Calculate scores for each slot
      const slotScores = TIME_SLOTS.map((slot) => {
        const slotData = scores.find((s) => s.timeSlot === slot.id);
        if (!slotData || slotData.totalAttempts === 0) {
          return { ...slot, score: 0.5, attempts: 0 };
        }

        // Score formula: (Completions - Snoozes - Ignores) / Total Attempts
        const score =
          (slotData.completions - slotData.snoozes * 0.5 - slotData.ignores) /
          slotData.totalAttempts;

        return {
          ...slot,
          score: Math.max(0, Math.min(1, (score + 1) / 2)), // Normalize to 0-1
          attempts: slotData.totalAttempts,
        };
      });

      // Find best slot
      const bestSlot = slotScores.reduce((best, current) =>
        current.score > best.score ? current : best
      );

      return {
        recommendation: {
          timeSlot: bestSlot.id,
          label: bestSlot.label,
          confidence: Math.round(bestSlot.score * 100),
          reason: generateRecommendationReason(bestSlot, category),
        },
        allSlots: slotScores,
      };
    },
    {
      query: t.Object({
        category: t.Optional(t.String()),
      }),
    }
  )

  // Get task suggestion ("What should I do now?")
  .get("/suggest", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const now = new Date();
    const currentHour = now.getHours();
    const currentSlot = getTimeSlotForHour(currentHour);

    // Get pending tasks
    const pendingTasks = await db.task.findMany({
      where: {
        userId: user.id,
        status: { in: ["PENDING", "SNOOZED", "ESCALATED"] },
      },
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
    });

    if (pendingTasks.length === 0) {
      return {
        suggestion: null,
        message: "All caught up! No pending tasks.",
        alternatives: [],
      };
    }

    // Get user's slot scores
    const slotScores = await db.timeSlotScore.findMany({
      where: { userId: user.id },
    });

    // Score each task for current context
    const scoredTasks = pendingTasks.map((task) => {
      let score = 0;

      // Priority weight
      const priorityScores = { URGENT: 40, HIGH: 30, MEDIUM: 20, LOW: 10 };
      score += priorityScores[task.priority as keyof typeof priorityScores] ?? 20;

      // Due date urgency
      if (task.dueAt) {
        const hoursUntilDue = (task.dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);
        if (hoursUntilDue < 0) score += 50; // Overdue
        else if (hoursUntilDue < 2) score += 40;
        else if (hoursUntilDue < 24) score += 20;
      }

      // Escalation weight
      if (task.status === "ESCALATED") score += 30;
      if (task.status === "SNOOZED") score += 15;

      // Time slot affinity
      const slotScore = slotScores.find(
        (s) => s.category === task.category && s.timeSlot === currentSlot
      );
      if (slotScore && slotScore.totalAttempts > 0) {
        const affinity =
          (slotScore.completions - slotScore.snoozes * 0.5) / slotScore.totalAttempts;
        score += affinity * 20;
      }

      return { task, score };
    });

    // Sort by score
    scoredTasks.sort((a, b) => b.score - a.score);

    const topTask = scoredTasks[0];
    const alternatives = scoredTasks.slice(1, 4);

    return {
      suggestion: {
        task: topTask.task,
        score: topTask.score,
        reason: generateSuggestionReason(topTask.task),
      },
      alternatives: alternatives.map((a) => ({
        task: a.task,
        reason: generateSuggestionReason(a.task),
      })),
      currentSlot: {
        id: currentSlot,
        label: TIME_SLOTS.find((s) => s.id === currentSlot)?.label,
      },
    };
  })

  // Submit feedback on a scheduling decision
  .post(
    "/feedback",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const { taskId, timeSlot, feedback, suggestedSlot } = body;

      // Get the task
      const task = await db.task.findFirst({
        where: { id: taskId, userId: user.id },
      });

      if (!task) return authError(404, "Task not found");

      // Update slot score based on feedback
      if (feedback === "good") {
        // Increase confidence in this slot
        await updateSlotScore(user.id, task.category, timeSlot, "positive");
      } else if (feedback === "bad" && suggestedSlot) {
        // Decrease confidence in current slot, increase for suggested
        await updateSlotScore(user.id, task.category, timeSlot, "negative");
        await updateSlotScore(user.id, task.category, suggestedSlot, "positive");

        // Reschedule task to suggested slot
        const slotInfo = TIME_SLOTS.find((s) => s.id === suggestedSlot);
        if (slotInfo) {
          const newScheduledAt = new Date();
          newScheduledAt.setHours(slotInfo.start, 0, 0, 0);

          // If time has passed today, schedule for tomorrow
          if (newScheduledAt < new Date()) {
            newScheduledAt.setDate(newScheduledAt.getDate() + 1);
          }

          await db.task.update({
            where: { id: taskId },
            data: { scheduledAt: newScheduledAt },
          });
        }
      }

      // Award XP for providing feedback
      await db.xpTransaction.create({
        data: {
          userId: user.id,
          amount: 5,
          source: "FEEDBACK",
          sourceId: taskId,
          description: "Provided scheduling feedback",
        },
      });

      return { success: true, xpEarned: 5 };
    },
    {
      body: t.Object({
        taskId: t.String(),
        timeSlot: t.String(),
        feedback: t.Enum({ good: "good", bad: "bad" }),
        suggestedSlot: t.Optional(t.String()),
      }),
    }
  )

  // Get user's productivity patterns
  .get("/patterns", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const [slotScores, completedTasks, energyLogs] = await Promise.all([
      db.timeSlotScore.findMany({ where: { userId: user.id } }),
      db.task.findMany({
        where: {
          userId: user.id,
          status: "COMPLETED",
          completedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      db.energyLog.findMany({
        where: {
          userId: user.id,
          loggedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    // Calculate best performing slots
    const slotPerformance = TIME_SLOTS.map((slot) => {
      const scores = slotScores.filter((s) => s.timeSlot === slot.id);
      const totalAttempts = scores.reduce((sum, s) => sum + s.totalAttempts, 0);
      const totalCompletions = scores.reduce((sum, s) => sum + s.completions, 0);

      return {
        slot: slot.id,
        label: slot.label,
        completionRate: totalAttempts > 0 ? (totalCompletions / totalAttempts) * 100 : 0,
        attempts: totalAttempts,
      };
    });

    // Find peak hours
    const peakSlots = [...slotPerformance]
      .sort((a, b) => b.completionRate - a.completionRate)
      .slice(0, 3);

    // Category analysis
    const categoryScores = slotScores.reduce((acc, score) => {
      if (!acc[score.category]) {
        acc[score.category] = { attempts: 0, completions: 0, bestSlot: null, bestRate: 0 };
      }
      acc[score.category].attempts += score.totalAttempts;
      acc[score.category].completions += score.completions;

      const rate = score.totalAttempts > 0 ? score.completions / score.totalAttempts : 0;
      if (rate > acc[score.category].bestRate) {
        acc[score.category].bestRate = rate;
        acc[score.category].bestSlot = score.timeSlot;
      }

      return acc;
    }, {} as Record<string, { attempts: number; completions: number; bestSlot: string | null; bestRate: number }>);

    // Average energy by time slot
    const energyBySlot = TIME_SLOTS.map((slot) => {
      const slotLogs = energyLogs.filter((log) => {
        const hour = log.loggedAt.getHours();
        return hour >= slot.start && hour < slot.end;
      });

      const avgEnergy =
        slotLogs.length > 0
          ? slotLogs.reduce((sum, log) => sum + log.level, 0) / slotLogs.length
          : null;

      return {
        slot: slot.id,
        label: slot.label,
        avgEnergy,
      };
    });

    return {
      slotPerformance,
      peakSlots,
      categoryBreakdown: categoryScores,
      energyPatterns: energyBySlot,
      insights: generateInsights(slotPerformance, categoryScores, energyBySlot),
    };
  })

  // Log energy level
  .post(
    "/energy",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const log = await db.energyLog.create({
        data: {
          userId: user.id,
          level: body.level,
          note: body.note,
          loggedAt: new Date(),
        },
      });

      return { log };
    },
    {
      body: t.Object({
        level: t.Number({ minimum: 1, maximum: 5 }),
        note: t.Optional(t.String({ maxLength: 200 })),
      }),
    }
  )

  // Get energy history
  .get("/energy", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const logs = await db.energyLog.findMany({
      where: {
        userId: user.id,
        loggedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { loggedAt: "desc" },
    });

    return { logs };
  });

// Helper functions
function getTimeSlotForHour(hour: number): string {
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

interface SlotScore {
  score: number;
  attempts: number;
  id: string;
  label: string;
}

function generateRecommendationReason(slot: SlotScore, category?: string): string {
  if (slot.attempts === 0) {
    return "No data yet. This is a commonly productive time slot.";
  }

  const percentage = Math.round(slot.score * 100);
  const categoryText = category ? ` for ${category} tasks` : "";

  if (percentage >= 80) {
    return `You complete ${percentage}% of tasks${categoryText} during ${slot.label}. Great time!`;
  } else if (percentage >= 60) {
    return `${slot.label} shows good completion rates${categoryText} (${percentage}%).`;
  } else {
    return `Based on your patterns, ${slot.label} is your best available slot${categoryText}.`;
  }
}

interface Task {
  status: string;
  priority: string;
  dueAt: Date | null;
  title: string;
}

function generateSuggestionReason(task: Task): string {
  const reasons: string[] = [];

  if (task.status === "ESCALATED") {
    reasons.push("This task has been rescheduled multiple times");
  }

  if (task.priority === "URGENT" || task.priority === "HIGH") {
    reasons.push(`${task.priority.toLowerCase()} priority`);
  }

  if (task.dueAt) {
    const hoursUntilDue = (task.dueAt.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilDue < 0) {
      reasons.push("overdue");
    } else if (hoursUntilDue < 24) {
      reasons.push("due soon");
    }
  }

  if (reasons.length === 0) {
    return "Good fit for current time slot";
  }

  return reasons.join(", ").charAt(0).toUpperCase() + reasons.join(", ").slice(1);
}

async function updateSlotScore(
  userId: string,
  category: string,
  timeSlot: string,
  type: "positive" | "negative"
) {
  const existing = await db.timeSlotScore.findFirst({
    where: { userId, category, timeSlot },
  });

  if (existing) {
    // Adjust score based on feedback
    await db.timeSlotScore.update({
      where: { id: existing.id },
      data: {
        completions: type === "positive" ? { increment: 1 } : undefined,
        snoozes: type === "negative" ? { increment: 1 } : undefined,
        totalAttempts: { increment: 1 },
      },
    });
  } else {
    await db.timeSlotScore.create({
      data: {
        userId,
        category,
        timeSlot,
        totalAttempts: 1,
        completions: type === "positive" ? 1 : 0,
        snoozes: type === "negative" ? 1 : 0,
        ignores: 0,
      },
    });
  }
}

interface SlotPerformance {
  slot: string;
  label: string;
  completionRate: number;
}

interface EnergySlot {
  slot: string;
  avgEnergy: number | null;
}

function generateInsights(
  slotPerformance: SlotPerformance[],
  categoryScores: Record<string, { bestSlot: string | null; bestRate: number }>,
  energyBySlot: EnergySlot[]
): string[] {
  const insights: string[] = [];

  // Best time insight
  const bestSlot = slotPerformance.reduce((best, current) =>
    current.completionRate > best.completionRate ? current : best
  );

  if (bestSlot.completionRate > 0) {
    insights.push(
      `Your peak productivity time is ${bestSlot.label} with ${Math.round(bestSlot.completionRate)}% completion rate.`
    );
  }

  // Category insights
  Object.entries(categoryScores).forEach(([category, data]) => {
    if (data.bestSlot && data.bestRate > 0.7) {
      const slotLabel = TIME_SLOTS.find((s) => s.id === data.bestSlot)?.label;
      insights.push(`${category} tasks work best during ${slotLabel}.`);
    }
  });

  // Energy correlation
  const highEnergySlots = energyBySlot.filter((s) => s.avgEnergy && s.avgEnergy >= 4);
  if (highEnergySlots.length > 0) {
    insights.push(
      `Your energy peaks during ${highEnergySlots.map((s) => s.slot).join(", ")}. Schedule important tasks then.`
    );
  }

  return insights.slice(0, 5); // Max 5 insights
}
