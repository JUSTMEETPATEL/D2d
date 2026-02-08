import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

// OAuth configuration - these would come from environment variables
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/calendar/google/callback";

const OUTLOOK_CLIENT_ID = process.env.OUTLOOK_CLIENT_ID || "";
const OUTLOOK_CLIENT_SECRET = process.env.OUTLOOK_CLIENT_SECRET || "";
const OUTLOOK_REDIRECT_URI = process.env.OUTLOOK_REDIRECT_URI || "http://localhost:3000/api/calendar/outlook/callback";

export const calendarRoutes = new Elysia({ prefix: "/calendar" })
  .use(authPlugin)

  // Get connected calendars
  .get("/connections", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const connections = await db.calendarConnection.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        provider: true,
        calendarName: true,
        isActive: true,
        lastSyncedAt: true,
        syncError: true,
      },
    });

    return { connections };
  })

  // Start Google Calendar OAuth flow
  .get("/google/auth", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    if (!GOOGLE_CLIENT_ID) {
      return authError(500, "Google Calendar integration not configured");
    }

    const scopes = [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events.readonly",
    ];

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes.join(" "));
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", user.id); // Pass user ID in state

    return { authUrl: authUrl.toString() };
  })

  // Google OAuth callback
  .get(
    "/google/callback",
    async ({ query, authError }) => {
      const { code, state: userId } = query;

      if (!code || !userId) {
        return authError(400, "Missing code or state");
      }

      try {
        // Exchange code for tokens
        const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: GOOGLE_REDIRECT_URI,
            grant_type: "authorization_code",
          }),
        });

        const tokens = await tokenResponse.json();

        if (!tokenResponse.ok) {
          return authError(400, "Failed to exchange code for tokens");
        }

        // Get primary calendar info
        const calendarResponse = await fetch(
          "https://www.googleapis.com/calendar/v3/calendars/primary",
          {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          }
        );
        const calendar = await calendarResponse.json();

        // Save connection
        await db.calendarConnection.upsert({
          where: {
            userId_provider: {
              userId,
              provider: "GOOGLE",
            },
          },
          create: {
            userId,
            provider: "GOOGLE",
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
            calendarId: calendar.id || "primary",
            calendarName: calendar.summary || "Primary Calendar",
          },
          update: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || undefined,
            expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
            calendarId: calendar.id || "primary",
            calendarName: calendar.summary || "Primary Calendar",
            isActive: true,
            syncError: null,
          },
        });

        // Redirect to success page
        return { success: true, message: "Google Calendar connected successfully" };
      } catch (error) {
        console.error("Google OAuth error:", error);
        return authError(500, "Failed to connect Google Calendar");
      }
    },
    {
      query: t.Object({
        code: t.String(),
        state: t.String(),
      }),
    }
  )

  // Start Outlook Calendar OAuth flow
  .get("/outlook/auth", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    if (!OUTLOOK_CLIENT_ID) {
      return authError(500, "Outlook Calendar integration not configured");
    }

    const scopes = ["Calendars.Read", "offline_access"];

    const authUrl = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    authUrl.searchParams.set("client_id", OUTLOOK_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", OUTLOOK_REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", scopes.join(" "));
    authUrl.searchParams.set("state", user.id);

    return { authUrl: authUrl.toString() };
  })

  // Outlook OAuth callback
  .get(
    "/outlook/callback",
    async ({ query, authError }) => {
      const { code, state: userId } = query;

      if (!code || !userId) {
        return authError(400, "Missing code or state");
      }

      try {
        // Exchange code for tokens
        const tokenResponse = await fetch(
          "https://login.microsoftonline.com/common/oauth2/v2.0/token",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code,
              client_id: OUTLOOK_CLIENT_ID,
              client_secret: OUTLOOK_CLIENT_SECRET,
              redirect_uri: OUTLOOK_REDIRECT_URI,
              grant_type: "authorization_code",
            }),
          }
        );

        const tokens = await tokenResponse.json();

        if (!tokenResponse.ok) {
          return authError(400, "Failed to exchange code for tokens");
        }

        // Save connection
        await db.calendarConnection.upsert({
          where: {
            userId_provider: {
              userId,
              provider: "OUTLOOK",
            },
          },
          create: {
            userId,
            provider: "OUTLOOK",
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
            calendarName: "Outlook Calendar",
          },
          update: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || undefined,
            expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
            isActive: true,
            syncError: null,
          },
        });

        return { success: true, message: "Outlook Calendar connected successfully" };
      } catch (error) {
        console.error("Outlook OAuth error:", error);
        return authError(500, "Failed to connect Outlook Calendar");
      }
    },
    {
      query: t.Object({
        code: t.String(),
        state: t.String(),
      }),
    }
  )

  // Sync calendar events
  .post("/:connectionId/sync", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const connection = await db.calendarConnection.findUnique({
      where: { id: params.connectionId },
    });

    if (!connection || connection.userId !== user.id) {
      return authError(404, "Calendar connection not found");
    }

    try {
      // Refresh token if needed
      let accessToken = connection.accessToken;
      if (connection.expiresAt && new Date() >= connection.expiresAt) {
        accessToken = await refreshAccessToken(connection);
      }

      // Fetch events based on provider
      const events = await fetchCalendarEvents(connection.provider, accessToken, connection.calendarId);

      // Clear old events and insert new ones
      await db.calendarEvent.deleteMany({
        where: { connectionId: connection.id },
      });

      if (events.length > 0) {
        await db.calendarEvent.createMany({
          data: events.map((event) => ({
            connectionId: connection.id,
            externalId: event.id,
            title: event.title,
            description: event.description,
            location: event.location,
            startTime: event.startTime,
            endTime: event.endTime,
            isAllDay: event.isAllDay,
            isBusy: event.isBusy,
          })),
        });
      }

      // Update last synced
      await db.calendarConnection.update({
        where: { id: connection.id },
        data: {
          lastSyncedAt: new Date(),
          syncError: null,
        },
      });

      return { success: true, eventsSynced: events.length };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Sync failed";
      await db.calendarConnection.update({
        where: { id: connection.id },
        data: { syncError: errorMessage },
      });
      return authError(500, errorMessage);
    }
  })

  // Get synced events for a date range
  .get(
    "/events",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const startDate = query.start ? new Date(query.start) : new Date();
      const endDate = query.end ? new Date(query.end) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const connections = await db.calendarConnection.findMany({
        where: { userId: user.id, isActive: true },
        include: {
          events: {
            where: {
              startTime: { gte: startDate },
              endTime: { lte: endDate },
            },
            orderBy: { startTime: "asc" },
          },
        },
      });

      const allEvents = connections.flatMap((c) =>
        c.events.map((e) => ({
          ...e,
          provider: c.provider,
          calendarName: c.calendarName,
        }))
      );

      return { events: allEvents.sort((a, b) => a.startTime.getTime() - b.startTime.getTime()) };
    },
    {
      query: t.Object({
        start: t.Optional(t.String({ format: "date-time" })),
        end: t.Optional(t.String({ format: "date-time" })),
      }),
    }
  )

  // Find free slots for task scheduling
  .get(
    "/free-slots",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const date = query.date ? new Date(query.date) : new Date();
      const durationMinutes = query.duration || 30;
      const workingHoursStart = query.workStart || 9;
      const workingHoursEnd = query.workEnd || 18;

      // Get day start and end
      const dayStart = new Date(date);
      dayStart.setHours(workingHoursStart, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(workingHoursEnd, 0, 0, 0);

      // Get busy events for the day
      const connections = await db.calendarConnection.findMany({
        where: { userId: user.id, isActive: true },
        include: {
          events: {
            where: {
              isBusy: true,
              startTime: { lte: dayEnd },
              endTime: { gte: dayStart },
            },
            orderBy: { startTime: "asc" },
          },
        },
      });

      const busyBlocks = connections
        .flatMap((c) => c.events)
        .map((e) => ({
          start: e.startTime,
          end: e.endTime,
        }))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

      // Find free slots
      const freeSlots: Array<{ start: Date; end: Date; durationMinutes: number }> = [];
      let currentTime = new Date(dayStart);

      for (const block of busyBlocks) {
        // If there's a gap before this block
        if (block.start > currentTime) {
          const gapMinutes = (block.start.getTime() - currentTime.getTime()) / 60000;
          if (gapMinutes >= durationMinutes) {
            freeSlots.push({
              start: new Date(currentTime),
              end: new Date(block.start),
              durationMinutes: gapMinutes,
            });
          }
        }
        // Move current time to end of busy block
        if (block.end > currentTime) {
          currentTime = new Date(block.end);
        }
      }

      // Check for remaining time after last event
      if (currentTime < dayEnd) {
        const remainingMinutes = (dayEnd.getTime() - currentTime.getTime()) / 60000;
        if (remainingMinutes >= durationMinutes) {
          freeSlots.push({
            start: new Date(currentTime),
            end: new Date(dayEnd),
            durationMinutes: remainingMinutes,
          });
        }
      }

      return { freeSlots, date: date.toISOString().split("T")[0] };
    },
    {
      query: t.Object({
        date: t.Optional(t.String({ format: "date" })),
        duration: t.Optional(t.Number({ minimum: 5, maximum: 480 })),
        workStart: t.Optional(t.Number({ minimum: 0, maximum: 23 })),
        workEnd: t.Optional(t.Number({ minimum: 1, maximum: 24 })),
      }),
    }
  )

  // Disconnect calendar
  .delete("/:connectionId", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const connection = await db.calendarConnection.findUnique({
      where: { id: params.connectionId },
    });

    if (!connection || connection.userId !== user.id) {
      return authError(404, "Calendar connection not found");
    }

    // Delete events first, then connection
    await db.calendarEvent.deleteMany({
      where: { connectionId: connection.id },
    });

    await db.calendarConnection.delete({
      where: { id: connection.id },
    });

    return { success: true };
  });

// Helper: Refresh access token
async function refreshAccessToken(connection: {
  provider: string;
  refreshToken: string | null;
  id: string;
}): Promise<string> {
  if (!connection.refreshToken) {
    throw new Error("No refresh token available");
  }

  let tokenUrl: string;
  let body: URLSearchParams;

  if (connection.provider === "GOOGLE") {
    tokenUrl = "https://oauth2.googleapis.com/token";
    body = new URLSearchParams({
      refresh_token: connection.refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    });
  } else if (connection.provider === "OUTLOOK") {
    tokenUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
    body = new URLSearchParams({
      refresh_token: connection.refreshToken,
      client_id: OUTLOOK_CLIENT_ID,
      client_secret: OUTLOOK_CLIENT_SECRET,
      grant_type: "refresh_token",
    });
  } else {
    throw new Error("Unsupported provider");
  }

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const tokens = await response.json();

  if (!response.ok) {
    throw new Error("Failed to refresh token");
  }

  // Update stored tokens
  await db.calendarConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: tokens.access_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
  });

  return tokens.access_token;
}

// Helper: Fetch calendar events from provider
async function fetchCalendarEvents(
  provider: string,
  accessToken: string,
  calendarId: string | null
): Promise<Array<{
  id: string;
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  isBusy: boolean;
}>> {
  const now = new Date();
  const oneMonthLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  if (provider === "GOOGLE") {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId || "primary")}/events`
    );
    url.searchParams.set("timeMin", now.toISOString());
    url.searchParams.set("timeMax", oneMonthLater.toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "250");

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch Google Calendar events");
    }

    const data = await response.json();

    return (data.items || []).map((event: {
      id: string;
      summary?: string;
      description?: string;
      location?: string;
      start: { dateTime?: string; date?: string };
      end: { dateTime?: string; date?: string };
      transparency?: string;
    }) => ({
      id: event.id,
      title: event.summary || "Untitled",
      description: event.description,
      location: event.location,
      startTime: new Date(event.start.dateTime || event.start.date || now),
      endTime: new Date(event.end.dateTime || event.end.date || now),
      isAllDay: !event.start.dateTime,
      isBusy: event.transparency !== "transparent",
    }));
  } else if (provider === "OUTLOOK") {
    const url = new URL("https://graph.microsoft.com/v1.0/me/calendar/events");
    url.searchParams.set("$filter", `start/dateTime ge '${now.toISOString()}' and end/dateTime le '${oneMonthLater.toISOString()}'`);
    url.searchParams.set("$orderby", "start/dateTime");
    url.searchParams.set("$top", "250");

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error("Failed to fetch Outlook Calendar events");
    }

    const data = await response.json();

    return (data.value || []).map((event: {
      id: string;
      subject?: string;
      body?: { content?: string };
      location?: { displayName?: string };
      start: { dateTime: string };
      end: { dateTime: string };
      isAllDay?: boolean;
      showAs?: string;
    }) => ({
      id: event.id,
      title: event.subject || "Untitled",
      description: event.body?.content,
      location: event.location?.displayName,
      startTime: new Date(event.start.dateTime),
      endTime: new Date(event.end.dateTime),
      isAllDay: event.isAllDay || false,
      isBusy: event.showAs !== "free",
    }));
  }

  return [];
}
