import { treaty } from "@elysiajs/eden";
import type { App } from "@/server/elysia";

// Create type-safe API client
export const api = treaty<App>("http://localhost:3000");
