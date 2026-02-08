import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

const habitSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  description: t.Optional(t.String({ maxLength: 500 })),
  icon: t.Optional(t.String()),
  targetDays: t.Optional(t.Number({ minimum: 1, maximum: 7 })), // days per week
});

export const habitsRoutes = new Elysia({ prefix: "/habits" })
  .use(authPlugin)
  // Get all micro-habits for user
  .get("/", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const habits = await db.microHabit.findMany({
      where: { userId: user.id },
      include: {
        logs: {
          where: {
            loggedAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // last 30 days
            },
          },
          orderBy: { loggedAt: "desc" },
        },
      },
    });

    // Calculate streaks and stats for each habit
    const habitsWithStats = habits.map((habit) => {
      const streak = calculateStreak(habit.logs);
      const completedThisWeek = habit.logs.filter((log) => {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return log.completed && log.loggedAt >= weekAgo;
      }).length;

      return {
        ...habit,
        currentStreak: streak,
        completedThisWeek,
        logs: habit.logs.slice(0, 7), // Only return last 7 days
      };
    });

    return { habits: habitsWithStats };
  })

  // Create micro-habit
  .post(
    "/",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      // Check habit limit for free users (5 habits)
      const existingCount = await db.microHabit.count({
        where: { userId: user.id },
      });

      if (existingCount >= 5) {
        return authError(403, "Free users can only have 5 micro-habits. Upgrade to premium for unlimited.");
      }

      const habit = await db.microHabit.create({
        data: {
          userId: user.id,
          name: body.name,
          description: body.description,
          icon: body.icon ?? "✓",
          targetDays: body.targetDays ?? 7,
        },
      });

      return { habit };
    },
    { body: habitSchema }
  )

  // Update micro-habit
  .patch(
    "/:id",
    async ({ user, authError, params, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const existing = await db.microHabit.findFirst({
        where: { id: params.id, userId: user.id },
      });

      if (!existing) return authError(404, "Habit not found");

      const habit = await db.microHabit.update({
        where: { id: params.id },
        data: body,
      });

      return { habit };
    },
    { body: habitSchema }
  )

  // Delete micro-habit
  .delete("/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const existing = await db.microHabit.findFirst({
      where: { id: params.id, userId: user.id },
    });

    if (!existing) return authError(404, "Habit not found");

    await db.microHabit.delete({ where: { id: params.id } });

    return { success: true };
  })

  // Log habit completion for today
  .post(
    "/:id/log",
    async ({ user, authError, params, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const habit = await db.microHabit.findFirst({
        where: { id: params.id, userId: user.id },
      });

      if (!habit) return authError(404, "Habit not found");

      const logDate = body.date ? new Date(body.date) : new Date();
      const startOfDay = new Date(logDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(logDate.setHours(23, 59, 59, 999));

      // Check if already logged today
      const existingLog = await db.habitLog.findFirst({
        where: {
          habitId: params.id,
          loggedAt: { gte: startOfDay, lte: endOfDay },
        },
      });

      if (existingLog) {
        // Toggle completion
        const updatedLog = await db.habitLog.update({
          where: { id: existingLog.id },
          data: { completed: !existingLog.completed },
        });

        return { log: updatedLog, toggled: true };
      }

      // Create new log
      const log = await db.habitLog.create({
        data: {
          habitId: params.id,
          completed: true,
          loggedAt: new Date(),
        },
      });

      // Award XP for completing habit
      await db.xpTransaction.create({
        data: {
          userId: user.id,
          amount: 5,
          source: "HABIT_COMPLETION",
          sourceId: log.id,
          description: `Completed habit: ${habit.name}`,
        },
      });

      // Check for streak bonuses
      const logs = await db.habitLog.findMany({
        where: { habitId: params.id, completed: true },
        orderBy: { loggedAt: "desc" },
        take: 8,
      });

      const streak = calculateStreak(logs);

      // Streak milestone XP bonuses
      let bonusXp = 0;
      if (streak === 7) bonusXp = 50;
      else if (streak === 30) bonusXp = 200;
      else if (streak === 100) bonusXp = 500;

      if (bonusXp > 0) {
        await db.xpTransaction.create({
          data: {
            userId: user.id,
            amount: bonusXp,
            source: "STREAK_BONUS",
            sourceId: habit.id,
            description: `${streak}-day streak for ${habit.name}!`,
          },
        });
      }

      return { log, xpEarned: 5 + bonusXp, currentStreak: streak };
    },
    {
      body: t.Object({
        date: t.Optional(t.String()),
      }),
    }
  )

  // Get habit calendar (last 30 days completion grid)
  .get("/:id/calendar", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const habit = await db.microHabit.findFirst({
      where: { id: params.id, userId: user.id },
    });

    if (!habit) return authError(404, "Habit not found");

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const logs = await db.habitLog.findMany({
      where: {
        habitId: params.id,
        loggedAt: { gte: thirtyDaysAgo },
      },
      orderBy: { loggedAt: "asc" },
    });

    // Create calendar grid
    const calendar: { date: string; completed: boolean }[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateStr = date.toISOString().split("T")[0];
      const log = logs.find((l) => l.loggedAt.toISOString().split("T")[0] === dateStr);
      calendar.push({ date: dateStr, completed: log?.completed ?? false });
    }

    return {
      habit,
      calendar,
      currentStreak: calculateStreak(logs.filter((l) => l.completed)),
      totalCompletions: logs.filter((l) => l.completed).length,
    };
  })

  // Get suggested habits
  .get("/suggestions", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const suggestions = [
      { name: "Drink 8 glasses of water", icon: "💧", description: "Stay hydrated throughout the day" },
      { name: "No phone first hour", icon: "📵", description: "Start your day mindfully without screens" },
      { name: "10 min meditation", icon: "🧘", description: "Center yourself with daily meditation" },
      { name: "Read 20 pages", icon: "📚", description: "Build knowledge through daily reading" },
      { name: "No social media before 10 AM", icon: "🚫", description: "Protect your morning focus" },
      { name: "3 things gratitude journal", icon: "🙏", description: "End day with gratitude reflection" },
      { name: "7 hours sleep", icon: "😴", description: "Prioritize quality sleep" },
      { name: "15 min walk", icon: "🚶", description: "Get moving every day" },
    ];

    // Filter out habits user already has
    const existingHabits = await db.microHabit.findMany({
      where: { userId: user.id },
      select: { name: true },
    });

    const existingNames = new Set(existingHabits.map((h) => h.name.toLowerCase()));
    const filteredSuggestions = suggestions.filter(
      (s) => !existingNames.has(s.name.toLowerCase())
    );

    return { suggestions: filteredSuggestions };
  });

// Helper function to calculate streak
interface HabitLog {
  loggedAt: Date;
  completed: boolean;
}

function calculateStreak(logs: HabitLog[]): number {
  if (logs.length === 0) return 0;

  const completedLogs = logs
    .filter((l) => l.completed)
    .sort((a, b) => b.loggedAt.getTime() - a.loggedAt.getTime());

  if (completedLogs.length === 0) return 0;

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < completedLogs.length; i++) {
    const logDate = new Date(completedLogs[i].loggedAt);
    logDate.setHours(0, 0, 0, 0);

    const expectedDate = new Date(today);
    expectedDate.setDate(today.getDate() - i);
    expectedDate.setHours(0, 0, 0, 0);

    // Allow for yesterday if checking today
    if (i === 0) {
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      if (logDate.getTime() !== today.getTime() && logDate.getTime() !== yesterday.getTime()) {
        break;
      }
      if (logDate.getTime() === yesterday.getTime()) {
        expectedDate.setDate(expectedDate.getDate() - 1);
      }
    } else if (logDate.getTime() !== expectedDate.getTime()) {
      break;
    }

    streak++;
  }

  return streak;
}
