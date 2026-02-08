import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

const mealLogSchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 255 }),
  calories: t.Number({ minimum: 0 }),
  protein: t.Optional(t.Number({ minimum: 0 })),
  carbs: t.Optional(t.Number({ minimum: 0 })),
  fat: t.Optional(t.Number({ minimum: 0 })),
  mealType: t.Optional(t.Enum({ BREAKFAST: "BREAKFAST", LUNCH: "LUNCH", DINNER: "DINNER", SNACK: "SNACK" })),
  loggedAt: t.Optional(t.String({ format: "date-time" })),
});

const waterLogSchema = t.Object({
  glasses: t.Number({ minimum: 1, maximum: 20 }),
  loggedAt: t.Optional(t.String({ format: "date-time" })),
});

const userProfileSchema = t.Object({
  age: t.Optional(t.Number({ minimum: 10, maximum: 120 })),
  weight: t.Optional(t.Number({ minimum: 20, maximum: 500 })), // kg
  height: t.Optional(t.Number({ minimum: 50, maximum: 300 })), // cm
  gender: t.Optional(t.Enum({ MALE: "MALE", FEMALE: "FEMALE", OTHER: "OTHER" })),
  activityLevel: t.Optional(
    t.Enum({
      SEDENTARY: "SEDENTARY",
      LIGHT: "LIGHT",
      MODERATE: "MODERATE",
      ACTIVE: "ACTIVE",
      VERY_ACTIVE: "VERY_ACTIVE",
    })
  ),
  fitnessGoal: t.Optional(t.Enum({ LOSE: "LOSE", MAINTAIN: "MAINTAIN", GAIN: "GAIN" })),
});

export const nutritionRoutes = new Elysia({ prefix: "/nutrition" })
  .use(authPlugin)
  // Get daily nutrition summary
  .get(
    "/daily",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const date = query.date ? new Date(query.date) : new Date();
      const startOfDay = new Date(date.setHours(0, 0, 0, 0));
      const endOfDay = new Date(date.setHours(23, 59, 59, 999));

      const [meals, waterLogs, profile] = await Promise.all([
        db.nutritionLog.findMany({
          where: {
            userId: user.id,
            loggedAt: { gte: startOfDay, lte: endOfDay },
          },
          orderBy: { loggedAt: "asc" },
        }),
        db.waterLog.findMany({
          where: {
            userId: user.id,
            loggedAt: { gte: startOfDay, lte: endOfDay },
          },
        }),
        db.userProfile.findUnique({ where: { userId: user.id } }),
      ]);

      // Calculate totals
      const totals = meals.reduce(
        (acc, meal) => ({
          calories: acc.calories + meal.calories,
          protein: acc.protein + (meal.protein ?? 0),
          carbs: acc.carbs + (meal.carbs ?? 0),
          fat: acc.fat + (meal.fat ?? 0),
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      );

      const totalWaterGlasses = waterLogs.reduce((acc, log) => acc + log.glasses, 0);

      // Calculate targets based on profile
      const targets = profile ? calculateTargets(profile) : getDefaultTargets();

      return {
        date: startOfDay.toISOString().split("T")[0],
        meals,
        totals,
        waterGlasses: totalWaterGlasses,
        targets,
        remaining: {
          calories: Math.max(0, targets.calories - totals.calories),
          protein: Math.max(0, targets.protein - totals.protein),
          carbs: Math.max(0, targets.carbs - totals.carbs),
          fat: Math.max(0, targets.fat - totals.fat),
          water: Math.max(0, 8 - totalWaterGlasses),
        },
      };
    },
    {
      query: t.Object({
        date: t.Optional(t.String()),
      }),
    }
  )

  // Log a meal
  .post(
    "/meals",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const meal = await db.nutritionLog.create({
        data: {
          userId: user.id,
          name: body.name,
          calories: body.calories,
          protein: body.protein,
          carbs: body.carbs,
          fat: body.fat,
          mealType: body.mealType ?? "SNACK",
          loggedAt: body.loggedAt ? new Date(body.loggedAt) : new Date(),
        },
      });

      // Award XP for logging nutrition
      await db.xpTransaction.create({
        data: {
          userId: user.id,
          amount: 15,
          source: "NUTRITION_LOG",
          sourceId: meal.id,
          description: `Logged meal: ${body.name}`,
        },
      });

      return { meal, xpEarned: 15 };
    },
    { body: mealLogSchema }
  )

  // Delete a meal log
  .delete("/meals/:id", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const existing = await db.nutritionLog.findFirst({
      where: { id: params.id, userId: user.id },
    });

    if (!existing) return authError(404, "Meal log not found");

    await db.nutritionLog.delete({ where: { id: params.id } });

    return { success: true };
  })

  // Log water intake
  .post(
    "/water",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const waterLog = await db.waterLog.create({
        data: {
          userId: user.id,
          glasses: body.glasses,
          loggedAt: body.loggedAt ? new Date(body.loggedAt) : new Date(),
        },
      });

      return { waterLog };
    },
    { body: waterLogSchema }
  )

  // Get weekly summary
  .get("/weekly", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const meals = await db.nutritionLog.findMany({
      where: {
        userId: user.id,
        loggedAt: { gte: weekAgo },
      },
      orderBy: { loggedAt: "asc" },
    });

    // Group by day
    const dailyTotals = meals.reduce((acc, meal) => {
      const day = meal.loggedAt.toISOString().split("T")[0];
      if (!acc[day]) {
        acc[day] = { calories: 0, protein: 0, carbs: 0, fat: 0, meals: 0 };
      }
      acc[day].calories += meal.calories;
      acc[day].protein += meal.protein ?? 0;
      acc[day].carbs += meal.carbs ?? 0;
      acc[day].fat += meal.fat ?? 0;
      acc[day].meals += 1;
      return acc;
    }, {} as Record<string, { calories: number; protein: number; carbs: number; fat: number; meals: number }>);

    const daysLogged = Object.keys(dailyTotals).length;
    const profile = await db.userProfile.findUnique({ where: { userId: user.id } });
    const targets = profile ? calculateTargets(profile) : getDefaultTargets();

    // Calculate days within target
    const daysOnTarget = Object.values(dailyTotals).filter(
      (day) => day.calories >= targets.calories * 0.9 && day.calories <= targets.calories * 1.1
    ).length;

    return {
      dailyTotals,
      summary: {
        daysLogged,
        daysOnTarget,
        averageCalories: daysLogged > 0 
          ? Math.round(Object.values(dailyTotals).reduce((sum, d) => sum + d.calories, 0) / daysLogged)
          : 0,
        consistency: daysLogged >= 5 ? "Good" : daysLogged >= 3 ? "Moderate" : "Needs improvement",
      },
    };
  })

  // Update user profile for nutrition calculations
  .put(
    "/profile",
    async ({ user, authError, body }) => {
      if (!user) return authError(401, "Unauthorized");

      const profile = await db.userProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...body },
        update: body,
      });

      const targets = calculateTargets(profile);

      return { profile, targets };
    },
    { body: userProfileSchema }
  )

  // Get user's nutrition profile and targets
  .get("/profile", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const profile = await db.userProfile.findUnique({ where: { userId: user.id } });

    if (!profile) {
      return { profile: null, targets: getDefaultTargets() };
    }

    return { profile, targets: calculateTargets(profile) };
  });

// Helper functions
interface UserProfile {
  age?: number | null;
  weight?: number | null;
  height?: number | null;
  gender?: string | null;
  activityLevel?: string | null;
  fitnessGoal?: string | null;
}

function calculateBMR(profile: UserProfile): number {
  const { weight, height, age, gender } = profile;
  if (!weight || !height || !age) return 2000;

  // Mifflin-St Jeor Equation
  if (gender === "MALE") {
    return 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    return 10 * weight + 6.25 * height - 5 * age - 161;
  }
}

function calculateTDEE(bmr: number, activityLevel?: string | null): number {
  const multipliers: Record<string, number> = {
    SEDENTARY: 1.2,
    LIGHT: 1.375,
    MODERATE: 1.55,
    ACTIVE: 1.725,
    VERY_ACTIVE: 1.9,
  };
  return Math.round(bmr * (multipliers[activityLevel ?? "MODERATE"] ?? 1.55));
}

function calculateTargets(profile: UserProfile) {
  const bmr = calculateBMR(profile);
  const tdee = calculateTDEE(bmr, profile.activityLevel);

  // Adjust for fitness goal
  let calorieTarget = tdee;
  if (profile.fitnessGoal === "LOSE") calorieTarget -= 500;
  if (profile.fitnessGoal === "GAIN") calorieTarget += 300;

  // Calculate macros (40% carbs, 30% protein, 30% fat)
  const protein = Math.round((calorieTarget * 0.3) / 4); // 4 cal per gram
  const carbs = Math.round((calorieTarget * 0.4) / 4);
  const fat = Math.round((calorieTarget * 0.3) / 9); // 9 cal per gram

  return {
    calories: Math.round(calorieTarget),
    protein,
    carbs,
    fat,
    bmr: Math.round(bmr),
    tdee,
  };
}

function getDefaultTargets() {
  return {
    calories: 2000,
    protein: 150,
    carbs: 200,
    fat: 65,
    bmr: 1600,
    tdee: 2000,
  };
}
