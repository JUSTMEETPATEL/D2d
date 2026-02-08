import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

// Goal templates for smart decomposition
const GOAL_TEMPLATES: Record<string, { milestones: Array<{ title: string; description: string; suggestedTasks: string[] }> }> = {
  "get-a-job": {
    milestones: [
      {
        title: "Prepare Materials",
        description: "Get your resume and portfolio ready",
        suggestedTasks: ["Update resume with latest experience", "Write a compelling summary", "Prepare portfolio/GitHub", "Get professional headshot"],
      },
      {
        title: "Research & Target",
        description: "Identify ideal companies and roles",
        suggestedTasks: ["List 20 target companies", "Research company cultures", "Identify key contacts on LinkedIn", "Set up job alerts"],
      },
      {
        title: "Apply Systematically",
        description: "Submit applications consistently",
        suggestedTasks: ["Apply to 3-5 jobs per day", "Customize cover letter for each", "Track all applications", "Follow up after 5-7 days"],
      },
      {
        title: "Interview Prep",
        description: "Prepare for interviews",
        suggestedTasks: ["Practice STAR method answers", "Prepare questions to ask", "Research common interview questions", "Do mock interviews"],
      },
      {
        title: "Negotiate & Close",
        description: "Handle offers professionally",
        suggestedTasks: ["Research salary ranges", "Prepare negotiation points", "Review offer details carefully", "Make final decision"],
      },
    ],
  },
  "lose-weight": {
    milestones: [
      {
        title: "Set Foundation",
        description: "Establish baseline and habits",
        suggestedTasks: ["Calculate TDEE and calorie target", "Plan weekly meal prep", "Set up nutrition tracking", "Measure starting weight/measurements"],
      },
      {
        title: "Build Exercise Routine",
        description: "Create sustainable workout plan",
        suggestedTasks: ["Schedule 3-4 workouts per week", "Start with 20-30 min sessions", "Mix cardio and strength", "Track workouts"],
      },
      {
        title: "Optimize Nutrition",
        description: "Dial in your diet",
        suggestedTasks: ["Increase protein intake", "Reduce processed foods", "Meal prep on Sundays", "Stay hydrated (8 glasses/day)"],
      },
      {
        title: "Stay Consistent",
        description: "Build long-term habits",
        suggestedTasks: ["Weekly weigh-ins (same time)", "Adjust calories as needed", "Plan for social events", "Get 7-8 hours sleep"],
      },
    ],
  },
  "learn-skill": {
    milestones: [
      {
        title: "Plan Learning Path",
        description: "Structure your learning journey",
        suggestedTasks: ["Define what 'proficient' means for you", "Find best resources (courses, books)", "Set weekly learning schedule", "Join community/forum"],
      },
      {
        title: "Build Foundation",
        description: "Master the basics",
        suggestedTasks: ["Complete beginner tutorials", "Take notes on key concepts", "Practice basic exercises daily", "Review and reinforce weekly"],
      },
      {
        title: "Practice Projects",
        description: "Apply knowledge practically",
        suggestedTasks: ["Build 3 small projects", "Document your work", "Get feedback from others", "Iterate and improve"],
      },
      {
        title: "Go Deeper",
        description: "Advanced learning",
        suggestedTasks: ["Study advanced topics", "Build a substantial project", "Teach someone else", "Contribute to open source/community"],
      },
    ],
  },
  "build-habit": {
    milestones: [
      {
        title: "Week 1-2: Start Small",
        description: "Begin with tiny version of habit",
        suggestedTasks: ["Define 2-minute version of habit", "Link to existing routine", "Track daily completion", "Don't miss two days in a row"],
      },
      {
        title: "Week 3-4: Build Consistency",
        description: "Increase frequency and duration",
        suggestedTasks: ["Gradually increase duration", "Create environment triggers", "Prepare day before", "Celebrate small wins"],
      },
      {
        title: "Month 2: Overcome Obstacles",
        description: "Handle challenges and setbacks",
        suggestedTasks: ["Identify common blockers", "Create backup plans", "Track patterns of success/failure", "Adjust timing if needed"],
      },
      {
        title: "Month 3+: Make it Identity",
        description: "Habit becomes part of who you are",
        suggestedTasks: ["Increase difficulty gradually", "Share progress with others", "Help someone else build habit", "Plan for maintenance long-term"],
      },
    ],
  },
};

const createGoalSchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 2000 })),
  category: t.Optional(t.String()),
  targetDate: t.Optional(t.String({ format: "date" })),
});

const milestoneSchema = t.Object({
  title: t.String({ minLength: 1, maxLength: 255 }),
  description: t.Optional(t.String({ maxLength: 1000 })),
  order: t.Number({ minimum: 0 }),
});

export const goalsRoutes = new Elysia({ prefix: "/goals" })
  .use(authPlugin)

  // Get all goals
  .get(
    "/",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const status = query.status || "ACTIVE";

      const goals = await db.goal.findMany({
        where: {
          userId: user.id,
          ...(status !== "all" && { status: status as "ACTIVE" | "COMPLETED" | "PAUSED" | "ABANDONED" }),
        },
        include: {
          milestones: {
            orderBy: { order: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      return { goals };
    },
    {
      query: t.Object({
        status: t.Optional(t.String()),
      }),
    }
  )

  // Get single goal
  .get("/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const goal = await db.goal.findUnique({
      where: { id: params.id },
      include: {
        milestones: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!goal) return authError(404, "Goal not found");
    if (goal.userId !== user.id) return authError(403, "Access denied");

    return { goal };
  })

  // Create goal
  .post(
    "/",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const goal = await db.goal.create({
        data: {
          userId: user.id,
          title: body.title,
          description: body.description,
          category: body.category || "General",
          targetDate: body.targetDate ? new Date(body.targetDate) : null,
        },
      });

      return { goal };
    },
    { body: createGoalSchema }
  )

  // Update goal
  .patch(
    "/:id",
    async ({ user, authError, params, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const existing = await db.goal.findUnique({ where: { id: params.id } });
      if (!existing) return authError(404, "Goal not found");
      if (existing.userId !== user.id) return authError(403, "Access denied");

      const goal = await db.goal.update({
        where: { id: params.id },
        data: {
          title: body.title,
          description: body.description,
          category: body.category,
          targetDate: body.targetDate ? new Date(body.targetDate) : undefined,
        },
      });

      return { goal };
    },
    { body: createGoalSchema }
  )

  // Delete goal
  .delete("/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const existing = await db.goal.findUnique({ where: { id: params.id } });
    if (!existing) return authError(404, "Goal not found");
    if (existing.userId !== user.id) return authError(403, "Access denied");

    await db.goal.delete({ where: { id: params.id } });

    return { success: true };
  })

  // Get decomposition templates
  .get("/templates/list", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const templates = Object.entries(GOAL_TEMPLATES).map(([key, value]) => ({
      id: key,
      name: key
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
      milestonesCount: value.milestones.length,
    }));

    return { templates };
  })

  // Smart decompose goal using template
  .post(
    "/:id/decompose",
    async ({ user, authError, params, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const goal = await db.goal.findUnique({
        where: { id: params.id },
        include: { milestones: true },
      });

      if (!goal) return authError(404, "Goal not found");
      if (goal.userId !== user.id) return authError(403, "Access denied");
      if (goal.milestones.length > 0) {
        return authError(400, "Goal already has milestones. Delete them first to re-decompose.");
      }

      const template = GOAL_TEMPLATES[body.templateId];
      if (!template) return authError(404, "Template not found");

      // Create milestones from template
      const milestones = await Promise.all(
        template.milestones.map((m, index) =>
          db.goalMilestone.create({
            data: {
              goalId: goal.id,
              title: m.title,
              description: m.description,
              order: index,
              linkedTaskIds: m.suggestedTasks, // Store suggested tasks as linked
            },
          })
        )
      );

      // Update goal total tasks count
      const totalTasks = template.milestones.reduce((sum, m) => sum + m.suggestedTasks.length, 0);
      await db.goal.update({
        where: { id: goal.id },
        data: { totalTasks },
      });

      return {
        milestones,
        totalSuggestedTasks: totalTasks,
        message: `Created ${milestones.length} milestones with ${totalTasks} suggested tasks`,
      };
    },
    {
      body: t.Object({
        templateId: t.String(),
      }),
    }
  )

  // Add milestone manually
  .post(
    "/:id/milestones",
    async ({ user, authError, params, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const goal = await db.goal.findUnique({ where: { id: params.id } });
      if (!goal) return authError(404, "Goal not found");
      if (goal.userId !== user.id) return authError(403, "Access denied");

      const milestone = await db.goalMilestone.create({
        data: {
          goalId: goal.id,
          title: body.title,
          description: body.description,
          order: body.order,
        },
      });

      return { milestone };
    },
    { body: milestoneSchema }
  )

  // Complete milestone
  .post("/:goalId/milestones/:milestoneId/complete", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const goal = await db.goal.findUnique({ where: { id: params.goalId } });
    if (!goal) return authError(404, "Goal not found");
    if (goal.userId !== user.id) return authError(403, "Access denied");

    const milestone = await db.goalMilestone.findUnique({
      where: { id: params.milestoneId },
    });
    if (!milestone || milestone.goalId !== goal.id) {
      return authError(404, "Milestone not found");
    }

    await db.goalMilestone.update({
      where: { id: params.milestoneId },
      data: {
        completed: true,
        completedAt: new Date(),
      },
    });

    // Update goal progress
    const allMilestones = await db.goalMilestone.findMany({
      where: { goalId: goal.id },
    });
    const completed = allMilestones.filter((m) => m.completed || m.id === params.milestoneId).length;
    const progress = (completed / allMilestones.length) * 100;

    await db.goal.update({
      where: { id: goal.id },
      data: {
        completedTasks: completed,
        progressPercent: progress,
        ...(progress === 100 && {
          status: "COMPLETED",
          completedAt: new Date(),
        }),
      },
    });

    return {
      success: true,
      progress,
      goalCompleted: progress === 100,
    };
  })

  // Create tasks from milestone suggestions
  .post(
    "/:goalId/milestones/:milestoneId/create-tasks",
    async ({ user, authError, params, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const goal = await db.goal.findUnique({ where: { id: params.goalId } });
      if (!goal) return authError(404, "Goal not found");
      if (goal.userId !== user.id) return authError(403, "Access denied");

      const milestone = await db.goalMilestone.findUnique({
        where: { id: params.milestoneId },
      });
      if (!milestone || milestone.goalId !== goal.id) {
        return authError(404, "Milestone not found");
      }

      const suggestedTasks = (milestone.linkedTaskIds as string[]) || [];
      const tasksToCreate = body.taskTitles || suggestedTasks;

      // Create tasks
      const tasks = await Promise.all(
        tasksToCreate.map((title: string) =>
          db.task.create({
            data: {
              userId: user.id,
              title,
              category: goal.category,
              description: `Part of goal: ${goal.title}`,
              scheduledAt: body.scheduledDate ? new Date(body.scheduledDate) : undefined,
            },
          })
        )
      );

      // Update milestone with task IDs
      const taskIds = tasks.map((t) => t.id);
      await db.goalMilestone.update({
        where: { id: params.milestoneId },
        data: { linkedTaskIds: taskIds },
      });

      return {
        tasksCreated: tasks.length,
        tasks,
      };
    },
    {
      body: t.Object({
        taskTitles: t.Optional(t.Array(t.String())),
        scheduledDate: t.Optional(t.String({ format: "date" })),
      }),
    }
  )

  // Update goal status
  .post(
    "/:id/status",
    async ({ user, authError, params, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const goal = await db.goal.findUnique({ where: { id: params.id } });
      if (!goal) return authError(404, "Goal not found");
      if (goal.userId !== user.id) return authError(403, "Access denied");

      const updated = await db.goal.update({
        where: { id: params.id },
        data: {
          status: body.status,
          ...(body.status === "COMPLETED" && { completedAt: new Date() }),
        },
      });

      return { goal: updated };
    },
    {
      body: t.Object({
        status: t.Enum({ ACTIVE: "ACTIVE", COMPLETED: "COMPLETED", PAUSED: "PAUSED", ABANDONED: "ABANDONED" }),
      }),
    }
  );
