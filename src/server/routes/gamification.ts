import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

// XP thresholds for levels
const LEVEL_THRESHOLDS = {
  BEGINNER: { min: 1, max: 10, xpPerLevel: 100 },
  INTERMEDIATE: { min: 11, max: 25, xpPerLevel: 200 },
  ADVANCED: { min: 26, max: 50, xpPerLevel: 500 },
  ELITE: { min: 51, max: Infinity, xpPerLevel: 1000 },
};

const DAILY_XP_CAP = 500;

export const gamificationRoutes = new Elysia({ prefix: "/gamification" })
  .use(authPlugin)
  // Get user stats and level info
  .get("/stats", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const stats = await db.userStats.findUnique({
      where: { userId: user.id },
    });

    if (!stats) {
      // Create default stats
      const newStats = await db.userStats.create({
        data: {
          userId: user.id,
          totalXp: 0,
          level: 1,
          tasksCompleted: 0,
          currentStreak: 0,
          longestStreak: 0,
          streakFreezes: 1,
        },
      });

      return formatStatsResponse(newStats);
    }

    return formatStatsResponse(stats);
  })

  // Get XP transaction history
  .get(
    "/xp/history",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const limit = query.limit ?? 20;
      const offset = query.offset ?? 0;

      const transactions = await db.xpTransaction.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      });

      const total = await db.xpTransaction.count({
        where: { userId: user.id },
      });

      return { transactions, total, limit, offset };
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
        offset: t.Optional(t.Number({ minimum: 0 })),
      }),
    }
  )

  // Get today's XP
  .get("/xp/today", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayXp = await db.xpTransaction.aggregate({
      where: {
        userId: user.id,
        createdAt: { gte: startOfDay },
      },
      _sum: { amount: true },
    });

    const earned = todayXp._sum.amount ?? 0;

    return {
      earned,
      cap: DAILY_XP_CAP,
      remaining: Math.max(0, DAILY_XP_CAP - earned),
      atCap: earned >= DAILY_XP_CAP,
    };
  })

  // Get achievements
  .get("/achievements", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const userAchievements = await db.userAchievement.findMany({
      where: { userId: user.id },
      include: { achievement: true },
    });

    const allAchievements = await db.achievement.findMany();

    const achievementsWithStatus = allAchievements.map((achievement) => {
      const userAchievement = userAchievements.find(
        (ua) => ua.achievementId === achievement.id
      );
      return {
        ...achievement,
        unlocked: !!userAchievement,
        unlockedAt: userAchievement?.unlockedAt ?? null,
      };
    });

    return { achievements: achievementsWithStatus };
  })

  // Get daily challenges/quests
  .get("/quests", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get or create daily quests
    let dailyQuests = await db.dailyQuest.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: today },
      },
    });

    if (dailyQuests.length === 0) {
      // Generate new daily quests
      dailyQuests = await generateDailyQuests(user.id);
    }

    return { quests: dailyQuests };
  })

  // Complete a quest
  .post("/:questId/complete", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const quest = await db.dailyQuest.findFirst({
      where: { id: params.questId, userId: user.id },
    });

    if (!quest) return authError(404, "Quest not found");
    if (quest.completed) return authError(400, "Quest already completed");

    // Verify quest completion based on type
    const isCompleted = await verifyQuestCompletion(user.id, quest);

    if (!isCompleted) {
      return authError(400, "Quest requirements not met");
    }

    // Mark quest as complete
    const updatedQuest = await db.dailyQuest.update({
      where: { id: params.questId },
      data: { completed: true, completedAt: new Date() },
    });

    // Award XP
    await db.xpTransaction.create({
      data: {
        userId: user.id,
        amount: quest.xpReward,
        source: "QUEST_COMPLETION",
        sourceId: quest.id,
        description: `Completed quest: ${quest.title}`,
      },
    });

    return { quest: updatedQuest, xpEarned: quest.xpReward };
  })

  // Get streak info
  .get("/streak", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const stats = await db.userStats.findUnique({
      where: { userId: user.id },
    });

    if (!stats) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        streakFreezes: 1,
        lastActivityDate: null,
      };
    }

    return {
      currentStreak: stats.currentStreak,
      longestStreak: stats.longestStreak,
      streakFreezes: stats.streakFreezes,
      lastActivityDate: stats.lastActivityDate,
    };
  })

  // Use streak freeze
  .post("/streak/freeze", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const stats = await db.userStats.findUnique({
      where: { userId: user.id },
    });

    if (!stats || stats.streakFreezes <= 0) {
      return authError(400, "No streak freezes available");
    }

    await db.userStats.update({
      where: { userId: user.id },
      data: {
        streakFreezes: { decrement: 1 },
        lastActivityDate: new Date(),
      },
    });

    return { success: true, remainingFreezes: stats.streakFreezes - 1 };
  })

  // Get leaderboard
  .get(
    "/leaderboard",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const type = query.type ?? "global";
      const limit = query.limit ?? 10;

      let leaderboard;

      if (type === "global") {
        leaderboard = await db.userStats.findMany({
          orderBy: { totalXp: "desc" },
          take: limit,
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
          },
        });
      } else if (type === "weekly") {
        // Weekly XP leaderboard
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const weeklyXp = await db.xpTransaction.groupBy({
          by: ["userId"],
          where: { createdAt: { gte: weekAgo } },
          _sum: { amount: true },
          orderBy: { _sum: { amount: "desc" } },
          take: limit,
        });

        const userIds = weeklyXp.map((x) => x.userId);
        const users = await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, image: true },
        });

        leaderboard = weeklyXp.map((x) => ({
          userId: x.userId,
          weeklyXp: x._sum.amount ?? 0,
          user: users.find((u) => u.id === x.userId),
        }));
      }

      // Find user's rank
      const userRank = await db.userStats.count({
        where: {
          totalXp: {
            gt: (await db.userStats.findUnique({ where: { userId: user.id } }))?.totalXp ?? 0,
          },
        },
      });

      return {
        leaderboard,
        userRank: userRank + 1,
      };
    },
    {
      query: t.Object({
        type: t.Optional(t.Enum({ global: "global", weekly: "weekly" })),
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
      }),
    }
  );

// Helper functions
interface UserStats {
  totalXp: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  tasksCompleted: number;
  streakFreezes: number;
}

function calculateLevel(totalXp: number): { level: number; tier: string; progress: number; xpForNext: number } {
  let remainingXp = totalXp;
  let level = 0;

  // Beginner: 1-10 (100 XP each)
  const beginnerLevels = Math.min(10, Math.floor(remainingXp / 100));
  level += beginnerLevels;
  remainingXp -= beginnerLevels * 100;

  if (level < 10) {
    return {
      level: level + 1,
      tier: "Beginner",
      progress: (remainingXp / 100) * 100,
      xpForNext: 100 - remainingXp,
    };
  }

  // Intermediate: 11-25 (200 XP each)
  const intermediateLevels = Math.min(15, Math.floor(remainingXp / 200));
  level += intermediateLevels;
  remainingXp -= intermediateLevels * 200;

  if (level < 25) {
    return {
      level: level + 1,
      tier: "Intermediate",
      progress: (remainingXp / 200) * 100,
      xpForNext: 200 - remainingXp,
    };
  }

  // Advanced: 26-50 (500 XP each)
  const advancedLevels = Math.min(25, Math.floor(remainingXp / 500));
  level += advancedLevels;
  remainingXp -= advancedLevels * 500;

  if (level < 50) {
    return {
      level: level + 1,
      tier: "Advanced",
      progress: (remainingXp / 500) * 100,
      xpForNext: 500 - remainingXp,
    };
  }

  // Elite: 51+ (1000 XP each)
  const eliteLevels = Math.floor(remainingXp / 1000);
  level += eliteLevels;
  remainingXp -= eliteLevels * 1000;

  return {
    level: level + 1,
    tier: "Elite",
    progress: (remainingXp / 1000) * 100,
    xpForNext: 1000 - remainingXp,
  };
}

function formatStatsResponse(stats: UserStats) {
  const levelInfo = calculateLevel(stats.totalXp);

  return {
    totalXp: stats.totalXp,
    ...levelInfo,
    currentStreak: stats.currentStreak,
    longestStreak: stats.longestStreak,
    tasksCompleted: stats.tasksCompleted,
    streakFreezes: stats.streakFreezes,
  };
}

async function generateDailyQuests(userId: string) {
  const questTemplates = [
    { title: "Complete 3 tasks", description: "Finish any 3 tasks today", type: "TASKS", target: 3, xpReward: 25 },
    { title: "Log a meal", description: "Track your nutrition", type: "NUTRITION", target: 1, xpReward: 15 },
    { title: "Complete a micro-habit", description: "Check off any habit", type: "HABIT", target: 1, xpReward: 10 },
    { title: "5 task streak", description: "Complete 5 tasks without snoozing", type: "TASK_STREAK", target: 5, xpReward: 50 },
  ];

  // Pick 3 random quests
  const shuffled = questTemplates.sort(() => 0.5 - Math.random());
  const selectedQuests = shuffled.slice(0, 3);

  const quests = await Promise.all(
    selectedQuests.map((quest) =>
      db.dailyQuest.create({
        data: {
          userId,
          title: quest.title,
          description: quest.description,
          type: quest.type,
          target: quest.target,
          xpReward: quest.xpReward,
          completed: false,
        },
      })
    )
  );

  return quests;
}

interface DailyQuest {
  type: string;
  target: number;
}

async function verifyQuestCompletion(userId: string, quest: DailyQuest): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (quest.type) {
    case "TASKS": {
      const completedTasks = await db.task.count({
        where: {
          userId,
          status: "COMPLETED",
          completedAt: { gte: today },
        },
      });
      return completedTasks >= quest.target;
    }
    case "NUTRITION": {
      const meals = await db.nutritionLog.count({
        where: {
          userId,
          loggedAt: { gte: today },
        },
      });
      return meals >= quest.target;
    }
    case "HABIT": {
      const habits = await db.habitLog.count({
        where: {
          habit: { userId },
          completed: true,
          loggedAt: { gte: today },
        },
      });
      return habits >= quest.target;
    }
    default:
      return false;
  }
}
