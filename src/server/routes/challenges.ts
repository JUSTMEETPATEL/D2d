import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

// Challenge definitions
const WEEKLY_CHALLENGES = [
  { title: "Task Master", description: "Complete 25 tasks this week", targetType: "tasks_completed", targetValue: 25, xpReward: 100, category: "TASKS" },
  { title: "Nutrition Pro", description: "Log nutrition 6 out of 7 days", targetType: "nutrition_days", targetValue: 6, xpReward: 75, category: "NUTRITION" },
  { title: "Habit Builder", description: "Complete all habits 5 days", targetType: "habit_days", targetValue: 5, xpReward: 100, category: "HABITS" },
  { title: "Social Butterfly", description: "Help 3 clan members", targetType: "clan_helps", targetValue: 3, xpReward: 50, category: "SOCIAL" },
  { title: "Focus Champion", description: "Complete 10 focus sessions", targetType: "focus_sessions", targetValue: 10, xpReward: 100, category: "FOCUS" },
  { title: "Streak Keeper", description: "Maintain a 7-day streak", targetType: "streak_days", targetValue: 7, xpReward: 150, category: "STREAK" },
];

const MONTHLY_CHALLENGES = [
  { title: "Century Club", description: "Complete 100 tasks this month", targetType: "tasks_completed", targetValue: 100, xpReward: 500, category: "TASKS" },
  { title: "Iron Streak", description: "Maintain a 21-day streak", targetType: "streak_days", targetValue: 21, xpReward: 500, category: "STREAK" },
  { title: "Nutrition Master", description: "Log nutrition 25 days", targetType: "nutrition_days", targetValue: 25, xpReward: 300, category: "NUTRITION" },
  { title: "Focus Legend", description: "Complete 50 focus sessions", targetType: "focus_sessions", targetValue: 50, xpReward: 400, category: "FOCUS" },
];

export const challengesRoutes = new Elysia({ prefix: "/challenges" })
  .use(authPlugin)

  // Get active challenges with progress
  .get("/", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const now = new Date();

    // Get user's active challenge progress
    const progress = await db.challengeProgress.findMany({
      where: {
        userId: user.id,
        periodEnd: { gte: now },
      },
      include: { challenge: true },
      orderBy: { challenge: { type: "asc" } },
    });

    // Group by type
    const daily = progress.filter((p) => p.challenge.type === "DAILY");
    const weekly = progress.filter((p) => p.challenge.type === "WEEKLY");
    const monthly = progress.filter((p) => p.challenge.type === "MONTHLY");
    const seasonal = progress.filter((p) => p.challenge.type === "SEASONAL");

    return { daily, weekly, monthly, seasonal };
  })

  // Get available challenges to join
  .get("/available", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const stats = await db.userStats.findUnique({ where: { userId: user.id } });
    const userLevel = calculateLevel(stats?.totalXp || 0);

    const now = new Date();

    // Get challenges user hasn't joined this period
    const existingProgress = await db.challengeProgress.findMany({
      where: {
        userId: user.id,
        periodEnd: { gte: now },
      },
      select: { challengeId: true },
    });
    const joinedIds = new Set(existingProgress.map((p) => p.challengeId));

    const available = await db.challenge.findMany({
      where: {
        isActive: true,
        levelRequired: { lte: userLevel },
        id: { notIn: Array.from(joinedIds) },
        OR: [
          { startDate: null },
          { startDate: { lte: now }, endDate: { gte: now } },
        ],
      },
      orderBy: [{ type: "asc" }, { xpReward: "desc" }],
    });

    return { challenges: available, userLevel };
  })

  // Join a challenge
  .post("/:id/join", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const challenge = await db.challenge.findUnique({
      where: { id: params.id },
    });

    if (!challenge) return authError(404, "Challenge not found");
    if (!challenge.isActive) return authError(400, "Challenge is not active");

    // Check level requirement
    const stats = await db.userStats.findUnique({ where: { userId: user.id } });
    const userLevel = calculateLevel(stats?.totalXp || 0);

    if (userLevel < challenge.levelRequired) {
      return authError(400, `Requires level ${challenge.levelRequired}`);
    }

    // Calculate period dates
    const now = new Date();
    const { periodStart, periodEnd } = calculatePeriod(challenge.type, now);

    // Check if already joined
    const existing = await db.challengeProgress.findUnique({
      where: {
        userId_challengeId_periodStart: {
          userId: user.id,
          challengeId: challenge.id,
          periodStart,
        },
      },
    });

    if (existing) return authError(400, "Already joined this challenge");

    const progress = await db.challengeProgress.create({
      data: {
        userId: user.id,
        challengeId: challenge.id,
        periodStart,
        periodEnd,
        currentValue: 0,
      },
      include: { challenge: true },
    });

    return { progress };
  })

  // Claim challenge reward
  .post("/:id/claim", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const now = new Date();

    // Find the progress for this challenge
    const progress = await db.challengeProgress.findFirst({
      where: {
        userId: user.id,
        challengeId: params.id,
        periodEnd: { gte: now },
      },
      include: { challenge: true },
    });

    if (!progress) return authError(404, "Challenge progress not found");
    if (!progress.isCompleted) return authError(400, "Challenge not completed yet");
    if (progress.isClaimed) return authError(400, "Reward already claimed");

    // Mark as claimed
    await db.challengeProgress.update({
      where: { id: progress.id },
      data: {
        isClaimed: true,
        claimedAt: new Date(),
      },
    });

    // Award XP
    await db.xpTransaction.create({
      data: {
        userId: user.id,
        amount: progress.challenge.xpReward,
        source: "QUEST_COMPLETION",
        sourceId: progress.challenge.id,
        description: `Challenge: ${progress.challenge.title}`,
      },
    });

    await db.userStats.upsert({
      where: { userId: user.id },
      create: { userId: user.id, totalXp: progress.challenge.xpReward },
      update: { totalXp: { increment: progress.challenge.xpReward } },
    });

    // Award item if applicable
    let itemAwarded = null;
    if (progress.challenge.itemRewardId) {
      const existing = await db.userAvatarItem.findUnique({
        where: {
          userId_itemId: { userId: user.id, itemId: progress.challenge.itemRewardId },
        },
      });

      if (!existing) {
        const userItem = await db.userAvatarItem.create({
          data: {
            userId: user.id,
            itemId: progress.challenge.itemRewardId,
            acquiredBy: "ACHIEVEMENT",
          },
          include: { item: true },
        });
        itemAwarded = userItem.item;
      }
    }

    return {
      success: true,
      xpAwarded: progress.challenge.xpReward,
      itemAwarded,
    };
  })

  // Get challenge leaderboard
  .get(
    "/:id/leaderboard",
    async ({ user, authError, params }) => {
      if (!user) return authError(401, "Unauthorized");

      const now = new Date();

      const progress = await db.challengeProgress.findMany({
        where: {
          challengeId: params.id,
          periodEnd: { gte: now },
        },
        orderBy: { currentValue: "desc" },
        take: 50,
      });

      // Get user details
      const userIds = progress.map((p) => p.userId);
      const users = await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, image: true },
      });

      const leaderboard = progress.map((p, index) => {
        const userData = users.find((u) => u.id === p.userId);
        return {
          rank: index + 1,
          userId: p.userId,
          name: userData?.name || "Unknown",
          image: userData?.image,
          currentValue: p.currentValue,
          isCompleted: p.isCompleted,
        };
      });

      // Find user's rank
      const userRank = leaderboard.find((l) => l.userId === user.id);

      return { leaderboard, userRank };
    }
  )

  // Admin: Seed challenges (for initial setup)
  .post("/seed", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    // Check if challenges already exist
    const existing = await db.challenge.count();
    if (existing > 0) {
      return { message: "Challenges already seeded", count: existing };
    }

    // Seed weekly challenges
    for (const c of WEEKLY_CHALLENGES) {
      await db.challenge.create({
        data: {
          type: "WEEKLY",
          category: c.category as "TASKS" | "NUTRITION" | "HABITS" | "SOCIAL" | "FOCUS" | "STREAK" | "MIXED",
          title: c.title,
          description: c.description,
          targetType: c.targetType,
          targetValue: c.targetValue,
          xpReward: c.xpReward,
          levelRequired: 1,
        },
      });
    }

    // Seed monthly challenges
    for (const c of MONTHLY_CHALLENGES) {
      await db.challenge.create({
        data: {
          type: "MONTHLY",
          category: c.category as "TASKS" | "NUTRITION" | "HABITS" | "SOCIAL" | "FOCUS" | "STREAK" | "MIXED",
          title: c.title,
          description: c.description,
          targetType: c.targetType,
          targetValue: c.targetValue,
          xpReward: c.xpReward,
          levelRequired: 5,
        },
      });
    }

    return { message: "Challenges seeded successfully", count: WEEKLY_CHALLENGES.length + MONTHLY_CHALLENGES.length };
  });

// Helper: Calculate level from XP
function calculateLevel(xp: number): number {
  if (xp < 1000) return Math.floor(xp / 100) + 1;
  if (xp < 4000) return 10 + Math.floor((xp - 1000) / 200);
  if (xp < 16500) return 25 + Math.floor((xp - 4000) / 500);
  return 50 + Math.floor((xp - 16500) / 1000);
}

// Helper: Calculate period start/end based on challenge type
function calculatePeriod(type: string, now: Date): { periodStart: Date; periodEnd: Date } {
  const start = new Date(now);
  const end = new Date(now);

  if (type === "DAILY") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (type === "WEEKLY") {
    // Week starts on Monday
    const dayOfWeek = start.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    start.setDate(start.getDate() + diff);
    start.setHours(0, 0, 0, 0);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (type === "MONTHLY") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    end.setHours(23, 59, 59, 999);
  } else {
    // SEASONAL - default to 3 months
    const quarter = Math.floor(start.getMonth() / 3);
    start.setMonth(quarter * 3);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth((quarter + 1) * 3);
    end.setDate(0);
    end.setHours(23, 59, 59, 999);
  }

  return { periodStart: start, periodEnd: end };
}

// Export helper for updating challenge progress from other routes
export async function updateChallengeProgress(
  userId: string,
  targetType: string,
  incrementBy: number = 1
) {
  const now = new Date();

  // Find active challenges with this target type
  const progress = await db.challengeProgress.findMany({
    where: {
      userId,
      periodEnd: { gte: now },
      isCompleted: false,
      challenge: { targetType },
    },
    include: { challenge: true },
  });

  for (const p of progress) {
    const newValue = p.currentValue + incrementBy;
    const isCompleted = newValue >= p.challenge.targetValue;

    await db.challengeProgress.update({
      where: { id: p.id },
      data: {
        currentValue: newValue,
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
      },
    });
  }
}
