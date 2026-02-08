import { Elysia } from "elysia";
import { auth } from "@/lib/auth";

// User type from session
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

// Session type
export interface AuthSession {
  id: string;
  userId: string;
  expiresAt: Date;
}

// Error response helper
const createErrorResponse = (status: number, message: string) => {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
};

// Auth plugin that validates Better-Auth sessions
export const authPlugin = new Elysia({ name: "auth" })
  .derive({ as: "global" }, async ({ request }) => {
    // Get session from Better-Auth
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    return {
      user: session?.user as AuthUser | null,
      session: session?.session as AuthSession | null,
      // Helper to create error responses
      authError: (status: number, message: string) => createErrorResponse(status, message),
    };
  });

// Helper type for protected routes
export type AuthContext = {
  user: AuthUser;
  session: AuthSession;
};
