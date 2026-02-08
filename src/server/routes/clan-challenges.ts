import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

export const clanChallengesRoutes = new Elysia({ prefix: "/clan-challenges" })
  .use(authPlugin)

  // Get active clan challenges
  .get(
    "/",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const { clanId } = query;

      // Verify membership
      const membership = await db.clanMembership.findFirst({
        where: { userId: user.id, clanId },
      });

      if (!membership) return authError(403, "Not a member of this clan");

      const now = new Date();

      const challenges = await db.clanChallenge.findMany({
        where: {
          clanId,
          endDate: { gte: now },
        },
        orderBy: { endDate: "asc" },
      });

      // Get member count for progress percentage
      const memberCount = await db.clanMembership.count({ where: { clanId } });

      const challengesWithProgress = challenges.map((c) => ({
        ...c,
        progressPercent: Math.min(100, Math.round((c.currentValue / c.targetValue) * 100)),
        memberCount,
        daysRemaining: Math.ceil((c.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      }));

      return { challenges: challengesWithProgress };
    },
    {
      query: t.Object({
        clanId: t.String(),
      }),
    }
  )

  // Get single clan challenge
  .get("/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const challenge = await db.clanChallenge.findUnique({
      where: { id: params.id },
    });

    if (!challenge) return authError(404, "Clan challenge not found");

    // Verify membership
    const membership = await db.clanMembership.findFirst({
      where: { userId: user.id, clanId: challenge.clanId },
    });

    if (!membership) return authError(403, "Not a member of this clan");

    const memberCount = await db.clanMembership.count({
      where: { clanId: challenge.clanId },
    });

    const now = new Date();

    return {
      challenge: {
        ...challenge,
        progressPercent: Math.min(100, Math.round((challenge.currentValue / challenge.targetValue) * 100)),
        memberCount,
        daysRemaining: Math.ceil((challenge.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      },
    };
  })

  // Create clan challenge (admin only)
  .post(
    "/",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      // Verify admin membership
      const membership = await db.clanMembership.findFirst({
        where: { userId: user.id, clanId: body.clanId },
      });

      if (!membership) return authError(403, "Not a member of this clan");
      if (membership.role !== "ADMIN" && membership.role !== "LEADER") {
        return authError(403, "Only admins can create clan challenges");
      }

      // Calculate dates
      const startDate = body.startDate ? new Date(body.startDate) : new Date();
      const endDate = body.endDate 
        ? new Date(body.endDate) 
        : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000); // Default 1 week

      const challenge = await db.clanChallenge.create({
        data: {
          clanId: body.clanId,
          title: body.title,
          description: body.description,
          targetType: body.targetType,
          targetValue: body.targetValue,
          xpMultiplier: body.xpMultiplier || 1.5,
          bonusXp: body.bonusXp || 100,
          startDate,
          endDate,
        },
      });

      return { challenge };
    },
    {
      body: t.Object({
        clanId: t.String(),
        title: t.String({ minLength: 1, maxLength: 255 }),
        description: t.String({ maxLength: 2000 }),
        targetType: t.String(), // e.g., "collective_tasks", "total_focus_minutes"
        targetValue: t.Number({ minimum: 1 }),
        xpMultiplier: t.Optional(t.Number({ minimum: 1, maximum: 3 })),
        bonusXp: t.Optional(t.Number({ minimum: 0, maximum: 500 })),
        startDate: t.Optional(t.String({ format: "date-time" })),
        endDate: t.Optional(t.String({ format: "date-time" })),
      }),
    }
  )

  // Update clan challenge progress (called by system or admin)
  .post("/:id/progress", async ({ user, authError, params, body }) => {
    if (!user) return authError(401, "Unauthorized");

    const challenge = await db.clanChallenge.findUnique({
      where: { id: params.id },
    });

    if (!challenge) return authError(404, "Clan challenge not found");

    // Verify membership
    const membership = await db.clanMembership.findFirst({
      where: { userId: user.id, clanId: challenge.clanId },
    });

    if (!membership) return authError(403, "Not a member of this clan");

    const newValue = challenge.currentValue + (body.increment || 1);
    const isCompleted = newValue >= challenge.targetValue;

    const updated = await db.clanChallenge.update({
      where: { id: params.id },
      data: {
        currentValue: newValue,
        isCompleted,
        completedAt: isCompleted && !challenge.isCompleted ? new Date() : challenge.completedAt,
      },
    });

    // If just completed, award bonus XP to all members
    if (isCompleted && !challenge.isCompleted) {
      const members = await db.clanMembership.findMany({
        where: { clanId: challenge.clanId },
      });

      for (const member of members) {
        await db.xpTransaction.create({
          data: {
            userId: member.userId,
            amount: challenge.bonusXp,
            source: "CLAN_ACTIVITY",
            sourceId: challenge.id,
            description: `Clan challenge completed: ${challenge.title}`,
          },
        });

        await db.userStats.upsert({
          where: { userId: member.userId },
          create: { userId: member.userId, totalXp: challenge.bonusXp },
          update: { totalXp: { increment: challenge.bonusXp } },
        });
      }
    }

    return {
      challenge: updated,
      justCompleted: isCompleted && !challenge.isCompleted,
      membersRewarded: isCompleted && !challenge.isCompleted 
        ? await db.clanMembership.count({ where: { clanId: challenge.clanId } }) 
        : 0,
    };
  },
  {
    body: t.Object({
      increment: t.Optional(t.Number({ minimum: 1 })),
    }),
  })

  // Delete clan challenge (admin only)
  .delete("/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const challenge = await db.clanChallenge.findUnique({
      where: { id: params.id },
    });

    if (!challenge) return authError(404, "Clan challenge not found");

    // Verify admin membership
    const membership = await db.clanMembership.findFirst({
      where: { userId: user.id, clanId: challenge.clanId },
    });

    if (!membership) return authError(403, "Not a member of this clan");
    if (membership.role !== "ADMIN" && membership.role !== "LEADER") {
      return authError(403, "Only admins can delete clan challenges");
    }

    await db.clanChallenge.delete({ where: { id: params.id } });

    return { success: true };
  })

  // Get clan challenge templates
  .get("/templates", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const templates = [
      {
        title: "Weekly Task Sprint",
        description: "Complete 100 tasks collectively as a clan",
        targetType: "collective_tasks",
        targetValue: 100,
        suggestedDays: 7,
      },
      {
        title: "Focus Marathon",
        description: "Accumulate 50 hours of focus time",
        targetType: "total_focus_minutes",
        targetValue: 3000,
        suggestedDays: 7,
      },
      {
        title: "Nutrition Week",
        description: "All members log nutrition 5 days each",
        targetType: "nutrition_logs",
        targetValue: 0, // Calculated based on member count
        suggestedDays: 7,
      },
      {
        title: "Streak Challenge",
        description: "Everyone maintains a 7-day streak",
        targetType: "member_streaks",
        targetValue: 0, // Calculated based on member count
        suggestedDays: 10,
      },
      {
        title: "Habit Heroes",
        description: "Complete 500 micro-habits as a team",
        targetType: "collective_habits",
        targetValue: 500,
        suggestedDays: 14,
      },
    ];

    return { templates };
  });

// Export helper for updating clan challenge progress from other routes
export async function updateClanChallengeProgress(
  clanId: string,
  targetType: string,
  incrementBy: number = 1
) {
  const now = new Date();

  // Find active challenges with this target type
  const challenges = await db.clanChallenge.findMany({
    where: {
      clanId,
      targetType,
      isCompleted: false,
      endDate: { gte: now },
    },
  });

  for (const challenge of challenges) {
    const newValue = challenge.currentValue + incrementBy;
    const isCompleted = newValue >= challenge.targetValue;

    await db.clanChallenge.update({
      where: { id: challenge.id },
      data: {
        currentValue: newValue,
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
      },
    });

    // If completed, award XP to all members
    if (isCompleted) {
      const members = await db.clanMembership.findMany({
        where: { clanId },
      });

      for (const member of members) {
        await db.xpTransaction.create({
          data: {
            userId: member.userId,
            amount: challenge.bonusXp,
            source: "CLAN_ACTIVITY",
            sourceId: challenge.id,
            description: `Clan challenge completed: ${challenge.title}`,
          },
        });

        await db.userStats.upsert({
          where: { userId: member.userId },
          create: { userId: member.userId, totalXp: challenge.bonusXp },
          update: { totalXp: { increment: challenge.bonusXp } },
        });
      }
    }
  }
}
