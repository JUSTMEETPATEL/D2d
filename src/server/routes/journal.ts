import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

// Default journal prompts
const DEFAULT_PROMPTS = [
  // Weekly prompts
  { text: "What worked well this week?", type: "WEEKLY", category: "reflection" },
  { text: "What got in the way of your progress?", type: "WEEKLY", category: "reflection" },
  { text: "What's the most important thing you learned?", type: "WEEKLY", category: "learning" },
  { text: "What would you do differently next week?", type: "WEEKLY", category: "improvement" },
  { text: "What are you most proud of from this week?", type: "WEEKLY", category: "celebration" },
  
  // Monthly prompts
  { text: "What was your biggest accomplishment this month?", type: "MONTHLY", category: "reflection" },
  { text: "What habits have you successfully built or broken?", type: "MONTHLY", category: "habits" },
  { text: "How have your priorities shifted?", type: "MONTHLY", category: "growth" },
  { text: "What goal do you want to focus on next month?", type: "MONTHLY", category: "planning" },
  
  // Daily prompts
  { text: "What are you grateful for today?", type: "DAILY", category: "gratitude" },
  { text: "What's one thing that would make today great?", type: "DAILY", category: "intention" },
  { text: "How are you feeling right now?", type: "DAILY", category: "mood" },
  { text: "What's on your mind?", type: "DAILY", category: "freeform" },
  
  // Milestone prompts
  { text: "How does achieving this make you feel?", type: "MILESTONE", category: "celebration" },
  { text: "What did you learn on the journey to this milestone?", type: "MILESTONE", category: "learning" },
  { text: "Who helped you along the way?", type: "MILESTONE", category: "gratitude" },
];

const createEntrySchema = t.Object({
  promptId: t.Optional(t.String()),
  promptText: t.Optional(t.String()),
  content: t.String({ minLength: 1, maxLength: 10000 }),
  mood: t.Optional(t.Number({ minimum: 1, maximum: 5 })),
  shareToClan: t.Optional(t.Boolean()),
  clanId: t.Optional(t.String()),
});

export const journalRoutes = new Elysia({ prefix: "/journal" })
  .use(authPlugin)

  // Get prompts for today
  .get(
    "/prompts",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const type = query.type || "DAILY";

      const prompts = await db.journalPrompt.findMany({
        where: {
          type: type as "WEEKLY" | "MONTHLY" | "DAILY" | "MILESTONE",
          isActive: true,
        },
      });

      // If no prompts exist, seed them
      if (prompts.length === 0) {
        const seeded = await Promise.all(
          DEFAULT_PROMPTS.filter((p) => p.type === type).map((p) =>
            db.journalPrompt.create({
              data: {
                promptText: p.text,
                type: p.type as "WEEKLY" | "MONTHLY" | "DAILY" | "MILESTONE",
                category: p.category,
              },
            })
          )
        );
        return { prompts: seeded };
      }

      return { prompts };
    },
    {
      query: t.Object({
        type: t.Optional(t.Enum({ DAILY: "DAILY", WEEKLY: "WEEKLY", MONTHLY: "MONTHLY", MILESTONE: "MILESTONE" })),
      }),
    }
  )

  // Get a random prompt
  .get("/prompts/random", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const prompts = await db.journalPrompt.findMany({
      where: { isActive: true },
    });

    if (prompts.length === 0) {
      // Seed all prompts
      await Promise.all(
        DEFAULT_PROMPTS.map((p) =>
          db.journalPrompt.create({
            data: {
              promptText: p.text,
              type: p.type as "WEEKLY" | "MONTHLY" | "DAILY" | "MILESTONE",
              category: p.category,
            },
          })
        )
      );
      const freshPrompts = await db.journalPrompt.findMany({ where: { isActive: true } });
      return { prompt: freshPrompts[Math.floor(Math.random() * freshPrompts.length)] };
    }

    const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];
    return { prompt: randomPrompt };
  })

  // Create journal entry
  .post(
    "/entries",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      // Get prompt text if promptId provided
      let promptText = body.promptText;
      if (body.promptId && !promptText) {
        const prompt = await db.journalPrompt.findUnique({
          where: { id: body.promptId },
        });
        if (prompt) promptText = prompt.promptText;
      }

      const entry = await db.journalEntry.create({
        data: {
          userId: user.id,
          promptId: body.promptId,
          promptText,
          content: body.content,
          mood: body.mood,
          isSharedToClan: body.shareToClan || false,
          sharedClanId: body.shareToClan ? body.clanId : null,
        },
      });

      // Award XP for journaling
      await db.xpTransaction.create({
        data: {
          userId: user.id,
          amount: 25,
          source: "JOURNALING",
          sourceId: entry.id,
          description: "Journal entry completed",
        },
      });

      await db.userStats.upsert({
        where: { userId: user.id },
        create: { userId: user.id, totalXp: 25 },
        update: { totalXp: { increment: 25 } },
      });

      return {
        entry,
        xpAwarded: 25,
      };
    },
    { body: createEntrySchema }
  )

  // Get journal entries
  .get(
    "/entries",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const limit = query.limit || 20;
      const offset = query.offset || 0;

      const [entries, total] = await Promise.all([
        db.journalEntry.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        db.journalEntry.count({ where: { userId: user.id } }),
      ]);

      return {
        entries,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + entries.length < total,
        },
      };
    },
    {
      query: t.Object({
        limit: t.Optional(t.Number({ minimum: 1, maximum: 100 })),
        offset: t.Optional(t.Number({ minimum: 0 })),
      }),
    }
  )

  // Get single entry
  .get("/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const entry = await db.journalEntry.findUnique({
      where: { id: params.id },
    });

    if (!entry) return authError(404, "Entry not found");
    if (entry.userId !== user.id) return authError(403, "Access denied");

    return { entry };
  })

  // Update entry
  .patch(
    "/:id",
    async ({ user, authError, params, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const existing = await db.journalEntry.findUnique({
        where: { id: params.id },
      });

      if (!existing) return authError(404, "Entry not found");
      if (existing.userId !== user.id) return authError(403, "Access denied");

      const entry = await db.journalEntry.update({
        where: { id: params.id },
        data: {
          content: body.content,
          mood: body.mood,
        },
      });

      return { entry };
    },
    {
      body: t.Object({
        content: t.Optional(t.String({ minLength: 1, maxLength: 10000 })),
        mood: t.Optional(t.Number({ minimum: 1, maximum: 5 })),
      }),
    }
  )

  // Delete entry
  .delete("/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const existing = await db.journalEntry.findUnique({
      where: { id: params.id },
    });

    if (!existing) return authError(404, "Entry not found");
    if (existing.userId !== user.id) return authError(403, "Access denied");

    await db.journalEntry.delete({ where: { id: params.id } });

    return { success: true };
  })

  // Get journal stats
  .get("/stats", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalEntries, recentEntries, moodEntries] = await Promise.all([
      db.journalEntry.count({ where: { userId: user.id } }),
      db.journalEntry.findMany({
        where: {
          userId: user.id,
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { createdAt: true, mood: true },
      }),
      db.journalEntry.findMany({
        where: {
          userId: user.id,
          mood: { not: null },
        },
        select: { mood: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);

    // Calculate streak
    const sortedDates = recentEntries
      .map((e) => e.createdAt.toISOString().split("T")[0])
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort()
      .reverse();

    let streak = 0;
    const today = now.toISOString().split("T")[0];
    let checkDate = today;

    for (const date of sortedDates) {
      if (date === checkDate) {
        streak++;
        const prev = new Date(checkDate);
        prev.setDate(prev.getDate() - 1);
        checkDate = prev.toISOString().split("T")[0];
      } else if (date < checkDate) {
        break;
      }
    }

    // Mood analysis
    const moodsWithValues = moodEntries.filter((e) => e.mood !== null);
    const avgMood = moodsWithValues.length > 0 ? moodsWithValues.reduce((sum, e) => sum + (e.mood || 0), 0) / moodsWithValues.length : null;

    // Entries per week (last 4 weeks)
    const weeklyEntries: Record<string, number> = {};
    recentEntries.forEach((e) => {
      const weekStart = getWeekStart(e.createdAt);
      weeklyEntries[weekStart] = (weeklyEntries[weekStart] || 0) + 1;
    });

    return {
      total: totalEntries,
      last30Days: recentEntries.length,
      currentStreak: streak,
      averageMood: avgMood ? Math.round(avgMood * 10) / 10 : null,
      weeklyBreakdown: weeklyEntries,
    };
  })

  // Search entries
  .get(
    "/search",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const entries = await db.journalEntry.findMany({
        where: {
          userId: user.id,
          content: {
            contains: query.q,
            mode: "insensitive",
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      return { entries, query: query.q };
    },
    {
      query: t.Object({
        q: t.String({ minLength: 2 }),
      }),
    }
  )

  // Seed default prompts (admin)
  .post("/prompts/seed", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const existing = await db.journalPrompt.count();
    if (existing > 0) {
      return { message: "Prompts already exist", count: existing };
    }

    const created = await Promise.all(
      DEFAULT_PROMPTS.map((p) =>
        db.journalPrompt.create({
          data: {
            promptText: p.text,
            type: p.type as "WEEKLY" | "MONTHLY" | "DAILY" | "MILESTONE",
            category: p.category,
          },
        })
      )
    );

    return { success: true, count: created.length };
  });

// Helper
function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}
