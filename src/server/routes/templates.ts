import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

// Pre-built system templates
const SYSTEM_TEMPLATES = [
  {
    name: "Morning Routine",
    description: "Start your day with intention and energy",
    category: "Wellness",
    icon: "🌅",
    tasks: [
      { title: "Wake up and hydrate", description: "Drink a glass of water", priority: "MEDIUM", estimatedMinutes: 5, order: 1 },
      { title: "Morning stretches", description: "10 minutes of light stretching", priority: "MEDIUM", estimatedMinutes: 10, order: 2 },
      { title: "Healthy breakfast", description: "Prepare and eat a nutritious meal", priority: "HIGH", estimatedMinutes: 20, order: 3 },
      { title: "Review today's priorities", description: "Check calendar and set top 3 goals", priority: "HIGH", estimatedMinutes: 10, order: 4 },
    ],
  },
  {
    name: "Job Application Workflow",
    description: "Systematic approach to landing your dream job",
    category: "Career",
    icon: "💼",
    tasks: [
      { title: "Update resume", description: "Tailor resume for the specific role", priority: "HIGH", estimatedMinutes: 30, order: 1 },
      { title: "Write cover letter", description: "Customize cover letter for company", priority: "HIGH", estimatedMinutes: 25, order: 2 },
      { title: "Submit application", description: "Apply through the portal", priority: "URGENT", estimatedMinutes: 10, order: 3 },
      { title: "Log application", description: "Track in spreadsheet/app", priority: "MEDIUM", estimatedMinutes: 5, order: 4 },
      { title: "Set follow-up reminder", description: "Schedule follow-up for 5-7 days", priority: "MEDIUM", estimatedMinutes: 5, order: 5 },
    ],
  },
  {
    name: "Study Session",
    description: "Focused learning with breaks",
    category: "Education",
    icon: "📚",
    tasks: [
      { title: "Review previous notes", description: "Quick recap of last session", priority: "MEDIUM", estimatedMinutes: 15, order: 1 },
      { title: "Active learning block", description: "25 min focused study (Pomodoro)", priority: "HIGH", estimatedMinutes: 25, order: 2 },
      { title: "Short break", description: "5 min rest - stretch or walk", priority: "LOW", estimatedMinutes: 5, order: 3 },
      { title: "Practice problems", description: "Apply what you learned", priority: "HIGH", estimatedMinutes: 25, order: 4 },
      { title: "Summary notes", description: "Write key takeaways", priority: "MEDIUM", estimatedMinutes: 10, order: 5 },
    ],
  },
  {
    name: "Workout Session",
    description: "Complete exercise routine with nutrition",
    category: "Fitness",
    icon: "💪",
    tasks: [
      { title: "Warm-up", description: "5-10 min light cardio", priority: "MEDIUM", estimatedMinutes: 10, order: 1 },
      { title: "Main workout", description: "Your planned exercises", priority: "HIGH", estimatedMinutes: 45, order: 2 },
      { title: "Cool-down stretches", description: "Static stretching for recovery", priority: "MEDIUM", estimatedMinutes: 10, order: 3 },
      { title: "Log nutrition", description: "Track post-workout meal/protein", priority: "MEDIUM", estimatedMinutes: 5, order: 4 },
      { title: "Hydrate", description: "Drink water and electrolytes", priority: "HIGH", estimatedMinutes: 5, order: 5 },
    ],
  },
  {
    name: "Weekly Planning Ritual",
    description: "Set yourself up for a successful week",
    category: "Productivity",
    icon: "📅",
    tasks: [
      { title: "Review last week", description: "What went well? What didn't?", priority: "HIGH", estimatedMinutes: 15, order: 1 },
      { title: "Set top 3 priorities", description: "Most important outcomes for the week", priority: "URGENT", estimatedMinutes: 10, order: 2 },
      { title: "Schedule recurring tasks", description: "Block time for regular activities", priority: "MEDIUM", estimatedMinutes: 10, order: 3 },
      { title: "Plan meals", description: "Rough meal plan for the week", priority: "LOW", estimatedMinutes: 10, order: 4 },
      { title: "Clear inbox", description: "Process emails and messages", priority: "MEDIUM", estimatedMinutes: 15, order: 5 },
    ],
  },
  {
    name: "Interview Preparation",
    description: "Get ready to ace your interview",
    category: "Career",
    icon: "🎯",
    tasks: [
      { title: "Research the company", description: "Mission, values, recent news", priority: "HIGH", estimatedMinutes: 30, order: 1 },
      { title: "Review job description", description: "Match your experience to requirements", priority: "HIGH", estimatedMinutes: 15, order: 2 },
      { title: "Prepare STAR stories", description: "Situation, Task, Action, Result examples", priority: "URGENT", estimatedMinutes: 45, order: 3 },
      { title: "Practice common questions", description: "Rehearse answers aloud", priority: "HIGH", estimatedMinutes: 30, order: 4 },
      { title: "Prepare questions to ask", description: "Show genuine interest", priority: "MEDIUM", estimatedMinutes: 15, order: 5 },
      { title: "Plan outfit and logistics", description: "What to wear, how to get there", priority: "MEDIUM", estimatedMinutes: 10, order: 6 },
    ],
  },
];

const templateTaskSchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
  category: t.Optional(t.String()),
  priority: t.Optional(t.Enum({ LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH", URGENT: "URGENT" })),
  estimatedMinutes: t.Optional(t.Number({ minimum: 1 })),
  order: t.Number({ minimum: 0 }),
});

const createTemplateSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  description: t.Optional(t.String({ maxLength: 500 })),
  category: t.Optional(t.String()),
  icon: t.Optional(t.String()),
  isPublic: t.Optional(t.Boolean()),
  tasks: t.Array(templateTaskSchema, { minItems: 1 }),
});

const useTemplateSchema = t.Object({
  scheduledDate: t.Optional(t.String({ format: "date" })),
  startTime: t.Optional(t.String()), // HH:mm format
});

export const templatesRoutes = new Elysia({ prefix: "/templates" })
  .use(authPlugin)
  
  // Get all templates (system + user's own + public)
  .get("/", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const [systemTemplates, userTemplates, publicTemplates] = await Promise.all([
      db.taskTemplate.findMany({
        where: { isSystem: true },
        orderBy: { name: "asc" },
      }),
      db.taskTemplate.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
      }),
      db.taskTemplate.findMany({
        where: {
          isPublic: true,
          isSystem: false,
          userId: { not: user.id },
        },
        orderBy: { useCount: "desc" },
        take: 20,
      }),
    ]);

    return {
      system: systemTemplates,
      mine: userTemplates,
      public: publicTemplates,
    };
  })

  // Get single template
  .get("/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const template = await db.taskTemplate.findUnique({
      where: { id: params.id },
    });

    if (!template) return authError(404, "Template not found");

    // Check access
    if (!template.isSystem && !template.isPublic && template.userId !== user.id) {
      return authError(403, "Access denied");
    }

    return { template };
  })

  // Create custom template
  .post(
    "/",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const template = await db.taskTemplate.create({
        data: {
          userId: user.id,
          name: body.name,
          description: body.description,
          category: body.category || "General",
          icon: body.icon || "📋",
          isPublic: body.isPublic || false,
          isSystem: false,
          tasks: body.tasks,
        },
      });

      return { template };
    },
    { body: createTemplateSchema }
  )

  // Update template
  .patch(
    "/:id",
    async ({ user, authError, params, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const existing = await db.taskTemplate.findUnique({
        where: { id: params.id },
      });

      if (!existing) return authError(404, "Template not found");
      if (existing.userId !== user.id) return authError(403, "Can only edit your own templates");
      if (existing.isSystem) return authError(403, "Cannot edit system templates");

      const template = await db.taskTemplate.update({
        where: { id: params.id },
        data: {
          name: body.name,
          description: body.description,
          category: body.category,
          icon: body.icon,
          isPublic: body.isPublic,
          tasks: body.tasks,
        },
      });

      return { template };
    },
    { body: createTemplateSchema }
  )

  // Delete template
  .delete("/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const existing = await db.taskTemplate.findUnique({
      where: { id: params.id },
    });

    if (!existing) return authError(404, "Template not found");
    if (existing.userId !== user.id) return authError(403, "Can only delete your own templates");
    if (existing.isSystem) return authError(403, "Cannot delete system templates");

    await db.taskTemplate.delete({ where: { id: params.id } });

    return { success: true };
  })

  // Use template - create tasks from template
  .post(
    "/:id/use",
    async ({ user, authError, params, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const template = await db.taskTemplate.findUnique({
        where: { id: params.id },
      });

      if (!template) return authError(404, "Template not found");

      // Check access
      if (!template.isSystem && !template.isPublic && template.userId !== user.id) {
        return authError(403, "Access denied");
      }

      const templateTasks = template.tasks as Array<{
        title: string;
        description?: string;
        category?: string;
        priority?: string;
        estimatedMinutes?: number;
        order: number;
      }>;

      // Calculate scheduled times
      const baseDate = body.scheduledDate ? new Date(body.scheduledDate) : new Date();
      const startHour = body.startTime ? parseInt(body.startTime.split(":")[0]) : 9;
      const startMinute = body.startTime ? parseInt(body.startTime.split(":")[1]) : 0;

      let currentTime = new Date(baseDate);
      currentTime.setHours(startHour, startMinute, 0, 0);

      // Create tasks from template
      const tasks = await Promise.all(
        templateTasks
          .sort((a, b) => a.order - b.order)
          .map(async (taskDef) => {
            const scheduledAt = new Date(currentTime);
            
            // Add estimated minutes to get next task's start time
            if (taskDef.estimatedMinutes) {
              currentTime = new Date(currentTime.getTime() + taskDef.estimatedMinutes * 60000);
            } else {
              currentTime = new Date(currentTime.getTime() + 30 * 60000); // Default 30 min
            }

            return db.task.create({
              data: {
                userId: user.id,
                title: taskDef.title,
                description: taskDef.description,
                category: taskDef.category || template.category,
                priority: (taskDef.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT") || "MEDIUM",
                estimatedMinutes: taskDef.estimatedMinutes,
                scheduledAt,
              },
            });
          })
      );

      // Increment use count
      await db.taskTemplate.update({
        where: { id: params.id },
        data: { useCount: { increment: 1 } },
      });

      return {
        success: true,
        tasksCreated: tasks.length,
        tasks,
      };
    },
    { body: useTemplateSchema }
  )

  // Seed system templates (admin endpoint)
  .post("/seed-system", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    // Check if system templates already exist
    const existing = await db.taskTemplate.count({ where: { isSystem: true } });
    if (existing > 0) {
      return { message: "System templates already seeded", count: existing };
    }

    // Create system templates
    const created = await Promise.all(
      SYSTEM_TEMPLATES.map((template) =>
        db.taskTemplate.create({
          data: {
            userId: null,
            name: template.name,
            description: template.description,
            category: template.category,
            icon: template.icon,
            isPublic: true,
            isSystem: true,
            tasks: template.tasks,
          },
        })
      )
    );

    return { success: true, count: created.length };
  });
