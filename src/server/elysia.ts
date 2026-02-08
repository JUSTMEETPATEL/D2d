import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";

// Import route modules
import { tasksRoutes } from "./routes/tasks";
import { nutritionRoutes } from "./routes/nutrition";
import { habitsRoutes } from "./routes/habits";
import { gamificationRoutes } from "./routes/gamification";
import { socialRoutes } from "./routes/social";
import { decisionEngineRoutes } from "./routes/decision-engine";
import { templatesRoutes } from "./routes/templates";
import { planningRoutes } from "./routes/planning";
import { wellbeingRoutes } from "./routes/wellbeing";
import { focusRoutes } from "./routes/focus";
import { goalsRoutes } from "./routes/goals";
import { journalRoutes } from "./routes/journal";
import { applicationsRoutes } from "./routes/applications";
import { sleepRoutes } from "./routes/sleep";
import { moodRoutes } from "./routes/mood";
import { notificationsRoutes } from "./routes/notifications";
import { calendarRoutes } from "./routes/calendar";
import { clanTasksRoutes } from "./routes/clan-tasks";
// Wave 2 gamification & social routes
import { avatarsRoutes } from "./routes/avatars";
import { challengesRoutes } from "./routes/challenges";
import { clanChallengesRoutes } from "./routes/clan-challenges";
import { marketplaceRoutes } from "./routes/marketplace";
import { achievementsRoutes } from "./routes/achievements";

export const app = new Elysia({ prefix: "/api" })
  .use(cors())
  // Core routes
  .use(tasksRoutes)
  .use(nutritionRoutes)
  .use(habitsRoutes)
  .use(gamificationRoutes)
  .use(socialRoutes)
  .use(decisionEngineRoutes)
  // Additional feature routes
  .use(templatesRoutes)
  .use(planningRoutes)
  .use(wellbeingRoutes)
  .use(focusRoutes)
  .use(goalsRoutes)
  .use(journalRoutes)
  .use(applicationsRoutes)
  .use(sleepRoutes)
  .use(moodRoutes)
  // Wave 1 infrastructure routes
  .use(notificationsRoutes)
  .use(calendarRoutes)
  .use(clanTasksRoutes)
  // Wave 2 gamification & social routes
  .use(avatarsRoutes)
  .use(challengesRoutes)
  .use(clanChallengesRoutes)
  .use(marketplaceRoutes)
  .use(achievementsRoutes)
  .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }));

export type App = typeof app;
