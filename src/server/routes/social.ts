import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

const clanSchema = t.Object({
  name: t.String({ minLength: 2, maxLength: 50 }),
  description: t.Optional(t.String({ maxLength: 500 })),
  type: t.Optional(t.Enum({ STUDY: "STUDY", FITNESS: "FITNESS", CAREER: "CAREER", GENERAL: "GENERAL" })),
  isPublic: t.Optional(t.Boolean()),
});

export const socialRoutes = new Elysia({ prefix: "/social" })
  .use(authPlugin)
  // Get user's social profile
  .get("/profile", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const [stats, memberships] = await Promise.all([
      db.userStats.findUnique({ where: { userId: user.id } }),
      db.clanMembership.findMany({
        where: { userId: user.id },
        include: { clan: true },
      }),
    ]);

    return {
      user: {
        id: user.id,
        name: user.name,
        image: user.image,
      },
      stats,
      clans: memberships.map((m) => ({
        ...m.clan,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    };
  })

  // Get another user's profile (respects privacy settings)
  .get("/profile/:userId", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const targetUser = await db.user.findUnique({
      where: { id: params.userId },
      select: {
        id: true,
        name: true,
        image: true,
        privacyLevel: true,
      },
    });

    if (!targetUser) return authError(404, "User not found");

    // Check privacy level
    if (targetUser.privacyLevel === "PRIVATE" && targetUser.id !== user.id) {
      return { 
        user: { id: targetUser.id, name: targetUser.name, image: targetUser.image },
        isPrivate: true,
      };
    }

    // For FRIENDS_ONLY, check if they share a clan
    if (targetUser.privacyLevel === "FRIENDS_ONLY" && targetUser.id !== user.id) {
      const sharedClans = await db.clanMembership.findMany({
        where: { userId: user.id },
        select: { clanId: true },
      });
      const sharedClanIds = sharedClans.map((c) => c.clanId);

      const targetInSharedClan = await db.clanMembership.findFirst({
        where: {
          userId: targetUser.id,
          clanId: { in: sharedClanIds },
        },
      });

      if (!targetInSharedClan) {
        return {
          user: { id: targetUser.id, name: targetUser.name, image: targetUser.image },
          isPrivate: true,
          reason: "friends_only",
        };
      }
    }

    // Get full profile
    const [stats, memberships, achievements] = await Promise.all([
      db.userStats.findUnique({ where: { userId: targetUser.id } }),
      db.clanMembership.findMany({
        where: { userId: targetUser.id },
        include: { clan: { select: { id: true, name: true, type: true } } },
      }),
      db.userAchievement.findMany({
        where: { userId: targetUser.id },
        include: { achievement: true },
        orderBy: { unlockedAt: "desc" },
        take: 10,
      }),
    ]);

    return {
      user: {
        id: targetUser.id,
        name: targetUser.name,
        image: targetUser.image,
      },
      stats,
      clans: memberships.map((m) => m.clan),
      achievements: achievements.map((a) => a.achievement),
      isPrivate: false,
    };
  })

  // Update privacy settings
  .patch(
    "/privacy",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      await db.user.update({
        where: { id: user.id },
        data: { privacyLevel: body.privacyLevel },
      });

      return { success: true, privacyLevel: body.privacyLevel };
    },
    {
      body: t.Object({
        privacyLevel: t.Enum({ PUBLIC: "PUBLIC", FRIENDS_ONLY: "FRIENDS_ONLY", PRIVATE: "PRIVATE" }),
      }),
    }
  )

  // Get user's clans
  .get("/clans", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const memberships = await db.clanMembership.findMany({
      where: { userId: user.id },
      include: {
        clan: {
          include: {
            _count: { select: { members: true } },
          },
        },
      },
    });

    return {
      clans: memberships.map((m) => ({
        ...m.clan,
        memberCount: m.clan._count.members,
        role: m.role,
      })),
    };
  })

  // Create a clan
  .post(
    "/clans",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      // Check clan limit (2 for free users)
      const membershipCount = await db.clanMembership.count({
        where: { userId: user.id },
      });

      if (membershipCount >= 2) {
        return authError(403, "Free users can only join 2 clans. Upgrade to premium for unlimited.");
      }

      const clan = await db.clan.create({
        data: {
          name: body.name,
          description: body.description,
          type: body.type ?? "GENERAL",
          isPublic: body.isPublic ?? true,
          createdBy: user.id,
          members: {
            create: {
              userId: user.id,
              role: "LEADER",
            },
          },
        },
        include: {
          _count: { select: { members: true } },
        },
      });

      return { clan };
    },
    { body: clanSchema }
  )

  // Get clan details
  .get("/clans/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const clan = await db.clan.findUnique({
      where: { id: params.id },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, image: true },
            },
          },
        },
        _count: { select: { members: true } },
      },
    });

    if (!clan) return authError(404, "Clan not found");

    // Check if user is member
    const isMember = clan.members.some((m) => m.userId === user.id);

    if (!clan.isPublic && !isMember) {
      return authError(403, "This clan is private");
    }

    // Get clan stats (aggregate member XP)
    const memberIds = clan.members.map((m) => m.userId);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const weeklyXp = await db.xpTransaction.aggregate({
      where: {
        userId: { in: memberIds },
        createdAt: { gte: weekAgo },
      },
      _sum: { amount: true },
    });

    return {
      clan: {
        ...clan,
        memberCount: clan._count.members,
        weeklyXp: weeklyXp._sum.amount ?? 0,
      },
      isMember,
    };
  })

  // Join a clan
  .post("/clans/:id/join", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const clan = await db.clan.findUnique({
      where: { id: params.id },
    });

    if (!clan) return authError(404, "Clan not found");
    if (!clan.isPublic) return authError(403, "This clan is private. Request an invite.");

    // Check if already member
    const existingMembership = await db.clanMembership.findFirst({
      where: { clanId: params.id, userId: user.id },
    });

    if (existingMembership) {
      return authError(400, "Already a member of this clan");
    }

    // Check clan limit
    const membershipCount = await db.clanMembership.count({
      where: { userId: user.id },
    });

    if (membershipCount >= 2) {
      return authError(403, "Free users can only join 2 clans");
    }

    const membership = await db.clanMembership.create({
      data: {
        clanId: params.id,
        userId: user.id,
        role: "MEMBER",
      },
    });

    return { membership };
  })

  // Leave a clan
  .post("/clans/:id/leave", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const membership = await db.clanMembership.findFirst({
      where: { clanId: params.id, userId: user.id },
    });

    if (!membership) {
      return authError(400, "Not a member of this clan");
    }

    // Leaders can't leave without transferring leadership
    if (membership.role === "LEADER") {
      const otherMembers = await db.clanMembership.count({
        where: { clanId: params.id, userId: { not: user.id } },
      });

      if (otherMembers > 0) {
        return authError(400, "Transfer leadership before leaving");
      }

      // Delete clan if leader is last member
      await db.clan.delete({ where: { id: params.id } });
      return { success: true, clanDeleted: true };
    }

    await db.clanMembership.delete({ where: { id: membership.id } });

    return { success: true };
  })

  // Search clans
  .get(
    "/clans/search",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const { q, type } = query;

      const clans = await db.clan.findMany({
        where: {
          isPublic: true,
          ...(q && {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { description: { contains: q, mode: "insensitive" as const } },
            ],
          }),
          ...(type && { type: type as "STUDY" | "FITNESS" | "CAREER" | "GENERAL" }),
        },
        include: {
          _count: { select: { members: true } },
        },
        take: 20,
      });

      return { clans };
    },
    {
      query: t.Object({
        q: t.Optional(t.String()),
        type: t.Optional(t.String()),
      }),
    }
  )

  // Get clan leaderboard
  .get("/clans/:id/leaderboard", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const members = await db.clanMembership.findMany({
      where: { clanId: params.id },
      include: {
        user: {
          select: { id: true, name: true, image: true },
        },
      },
    });

    const memberIds = members.map((m) => m.userId);

    const stats = await db.userStats.findMany({
      where: { userId: { in: memberIds } },
    });

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const weeklyXp = await db.xpTransaction.groupBy({
      by: ["userId"],
      where: {
        userId: { in: memberIds },
        createdAt: { gte: weekAgo },
      },
      _sum: { amount: true },
    });

    const leaderboard = members
      .map((m) => {
        const userStats = stats.find((s) => s.userId === m.userId);
        const weekly = weeklyXp.find((w) => w.userId === m.userId);
        return {
          user: m.user,
          role: m.role,
          totalXp: userStats?.totalXp ?? 0,
          weeklyXp: weekly?._sum.amount ?? 0,
          level: userStats?.level ?? 1,
        };
      })
      .sort((a, b) => b.weeklyXp - a.weeklyXp);

    return { leaderboard };
  })

  // Invite to clan
  .post(
    "/clans/:id/invite",
    async ({ user, authError, params, body }) => {
      if (!user) return authError(401, "Unauthorized");

      // Check if user is admin/leader
      const membership = await db.clanMembership.findFirst({
        where: { clanId: params.id, userId: user.id },
      });

      if (!membership || !["LEADER", "ADMIN"].includes(membership.role)) {
        return authError(403, "Only admins can invite members");
      }

      // Create invite
      const invite = await db.clanInvite.create({
        data: {
          clanId: params.id,
          invitedEmail: body.email,
          invitedBy: user.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      return { invite };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
      }),
    }
  )

  // Get global leaderboard
  .get(
    "/leaderboard",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const limit = query.limit ?? 20;
      const type = query.type ?? "weekly";

      if (type === "weekly") {
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

        const stats = await db.userStats.findMany({
          where: { userId: { in: userIds } },
        });

        const leaderboard = weeklyXp.map((x, index) => ({
          rank: index + 1,
          user: users.find((u) => u.id === x.userId),
          weeklyXp: x._sum.amount ?? 0,
          level: stats.find((s) => s.userId === x.userId)?.level ?? 1,
          isCurrentUser: x.userId === user.id,
        }));

        return { leaderboard, type: "weekly" };
      }

      // All-time leaderboard
      const topStats = await db.userStats.findMany({
        orderBy: { totalXp: "desc" },
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, image: true },
          },
        },
      });

      const leaderboard = topStats.map((s, index) => ({
        rank: index + 1,
        user: s.user,
        totalXp: s.totalXp,
        level: s.level,
        isCurrentUser: s.userId === user.id,
      }));

      return { leaderboard, type: "allTime" };
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
        type: t.Optional(t.Enum({ weekly: "weekly", allTime: "allTime" })),
      }),
    }
  );
