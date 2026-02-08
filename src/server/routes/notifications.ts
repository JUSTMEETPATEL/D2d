import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

export const notificationsRoutes = new Elysia({ prefix: "/notifications" })
  .use(authPlugin)

  // Register device token for push notifications
  .post(
    "/device-token",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const token = await db.deviceToken.upsert({
        where: { token: body.token },
        create: {
          userId: user.id,
          token: body.token,
          platform: body.platform,
          deviceName: body.deviceName,
        },
        update: {
          userId: user.id,
          platform: body.platform,
          deviceName: body.deviceName,
          isActive: true,
          lastUsedAt: new Date(),
        },
      });

      return { token };
    },
    {
      body: t.Object({
        token: t.String({ minLength: 1 }),
        platform: t.Enum({ IOS: "IOS", ANDROID: "ANDROID", WEB: "WEB" }),
        deviceName: t.Optional(t.String()),
      }),
    }
  )

  // Remove device token
  .delete("/device-token/:token", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    await db.deviceToken.updateMany({
      where: {
        token: params.token,
        userId: user.id,
      },
      data: { isActive: false },
    });

    return { success: true };
  })

  // Get notification preferences
  .get("/preferences", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    let preferences = await db.notificationPreference.findUnique({
      where: { userId: user.id },
    });

    // Create default preferences if not exist
    if (!preferences) {
      preferences = await db.notificationPreference.create({
        data: { userId: user.id },
      });
    }

    return { preferences };
  })

  // Update notification preferences
  .patch(
    "/preferences",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const preferences = await db.notificationPreference.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          ...body,
        },
        update: body,
      });

      return { preferences };
    },
    {
      body: t.Object({
        taskReminders: t.Optional(t.Boolean()),
        taskEscalations: t.Optional(t.Boolean()),
        streakReminders: t.Optional(t.Boolean()),
        socialUpdates: t.Optional(t.Boolean()),
        clanActivity: t.Optional(t.Boolean()),
        weeklyDigest: t.Optional(t.Boolean()),
        achievementUnlocks: t.Optional(t.Boolean()),
        quietHoursEnabled: t.Optional(t.Boolean()),
        quietHoursStart: t.Optional(t.String()),
        quietHoursEnd: t.Optional(t.String()),
      }),
    }
  )

  // Get notifications (inbox)
  .get(
    "/",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const limit = query.limit || 50;
      const unreadOnly = query.unreadOnly ?? false;

      const notifications = await db.notification.findMany({
        where: {
          userId: user.id,
          ...(unreadOnly && { isRead: false }),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      const unreadCount = await db.notification.count({
        where: {
          userId: user.id,
          isRead: false,
        },
      });

      return { notifications, unreadCount };
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
        unreadOnly: t.Optional(t.Boolean()),
      }),
    }
  )

  // Mark notification as read
  .post("/:id/read", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    await db.notification.updateMany({
      where: {
        id: params.id,
        userId: user.id,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { success: true };
  })

  // Mark all notifications as read
  .post("/read-all", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const result = await db.notification.updateMany({
      where: {
        userId: user.id,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { success: true, count: result.count };
  })

  // Delete notification
  .delete("/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    await db.notification.deleteMany({
      where: {
        id: params.id,
        userId: user.id,
      },
    });

    return { success: true };
  })

  // Clear old notifications (30+ days)
  .delete("/clear-old", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await db.notification.deleteMany({
      where: {
        userId: user.id,
        createdAt: { lt: thirtyDaysAgo },
      },
    });

    return { success: true, deleted: result.count };
  });

// Helper function to create notifications (used by other services)
export async function createNotification(
  userId: string,
  type: "TASK_REMINDER" | "TASK_ESCALATION" | "TASK_OVERDUE" | "STREAK_WARNING" | "STREAK_ACHIEVED" | "ACHIEVEMENT_UNLOCKED" | "CLAN_INVITE" | "CLAN_ACTIVITY" | "CLAN_TASK" | "WEEKLY_DIGEST" | "BURNOUT_WARNING" | "BREAK_SUGGESTION" | "GOAL_MILESTONE" | "SYSTEM",
  title: string,
  body: string,
  data?: Record<string, string | number | boolean>
) {
  return db.notification.create({
    data: {
      userId,
      type,
      title,
      body,
      data: data ? JSON.parse(JSON.stringify(data)) : undefined,
    },
  });
}

// Helper to check if notifications are allowed for a user
export async function canSendNotification(userId: string, type: string): Promise<boolean> {
  const prefs = await db.notificationPreference.findUnique({
    where: { userId },
  });

  if (!prefs) return true; // Default to allowing

  // Check quiet hours
  if (prefs.quietHoursEnabled && prefs.quietHoursStart && prefs.quietHoursEnd) {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    
    if (prefs.quietHoursStart <= prefs.quietHoursEnd) {
      // Same day quiet hours (e.g., 22:00 to 08:00 next day won't work with this)
      if (currentTime >= prefs.quietHoursStart && currentTime <= prefs.quietHoursEnd) {
        return false;
      }
    } else {
      // Overnight quiet hours (e.g., 22:00 to 08:00)
      if (currentTime >= prefs.quietHoursStart || currentTime <= prefs.quietHoursEnd) {
        return false;
      }
    }
  }

  // Check type-specific preferences
  const typeMap: Record<string, keyof typeof prefs> = {
    TASK_REMINDER: "taskReminders",
    TASK_ESCALATION: "taskEscalations",
    TASK_OVERDUE: "taskReminders",
    STREAK_WARNING: "streakReminders",
    STREAK_ACHIEVED: "streakReminders",
    ACHIEVEMENT_UNLOCKED: "achievementUnlocks",
    CLAN_INVITE: "socialUpdates",
    CLAN_ACTIVITY: "clanActivity",
    CLAN_TASK: "clanActivity",
    WEEKLY_DIGEST: "weeklyDigest",
  };

  const prefKey = typeMap[type];
  if (prefKey && prefs[prefKey] === false) {
    return false;
  }

  return true;
}
