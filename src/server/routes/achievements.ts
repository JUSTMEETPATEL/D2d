import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

export const achievementsRoutes = new Elysia({ prefix: "/achievements" })
  .use(authPlugin)

  // Get all achievements with user progress
  .get("/", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const achievements = await db.achievement.findMany({
      orderBy: [{ category: "asc" }, { xpReward: "asc" }],
    });

    const userAchievements = await db.userAchievement.findMany({
      where: { userId: user.id },
    });
    const unlockedIds = new Set(userAchievements.map((ua) => ua.achievementId));

    const stats = await db.userStats.findUnique({ where: { userId: user.id } });

    const achievementsWithProgress = achievements.map((a) => ({
      ...a,
      unlocked: unlockedIds.has(a.id),
      unlockedAt: userAchievements.find((ua) => ua.achievementId === a.id)?.unlockedAt,
      progress: calculateAchievementProgress(a, stats),
    }));

    // Group by category
    const byCategory = achievementsWithProgress.reduce((acc, a) => {
      if (!acc[a.category]) acc[a.category] = [];
      acc[a.category].push(a);
      return acc;
    }, {} as Record<string, typeof achievementsWithProgress>);

    const totalUnlocked = userAchievements.length;
    const totalAchievements = achievements.length;

    return { achievements: achievementsWithProgress, byCategory, totalUnlocked, totalAchievements };
  })

  // Get user's unlocked achievements
  .get("/unlocked", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const userAchievements = await db.userAchievement.findMany({
      where: { userId: user.id },
      include: { achievement: true },
      orderBy: { unlockedAt: "desc" },
    });

    return { achievements: userAchievements };
  })

  // Generate shareable achievement card (SVG)
  .get("/:id/card", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const userAchievement = await db.userAchievement.findFirst({
      where: { userId: user.id, achievementId: params.id },
      include: { achievement: true },
    });

    if (!userAchievement) {
      return authError(404, "Achievement not unlocked");
    }

    const userData = await db.user.findUnique({
      where: { id: user.id },
      select: { name: true },
    });

    const stats = await db.userStats.findUnique({ where: { userId: user.id } });
    const userLevel = calculateLevel(stats?.totalXp || 0);

    // Generate SVG card
    const svg = generateAchievementCard({
      achievementName: userAchievement.achievement.name,
      achievementDescription: userAchievement.achievement.description,
      achievementIcon: userAchievement.achievement.icon,
      userName: userData?.name || "D2D User",
      userLevel,
      unlockedAt: userAchievement.unlockedAt,
      xpReward: userAchievement.achievement.xpReward,
    });

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  })

  // Generate profile achievement showcase card
  .get("/showcase-card", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const userData = await db.user.findUnique({
      where: { id: user.id },
      select: { name: true },
    });

    const stats = await db.userStats.findUnique({ where: { userId: user.id } });
    const userLevel = calculateLevel(stats?.totalXp || 0);

    // Get top achievements (most XP)
    const userAchievements = await db.userAchievement.findMany({
      where: { userId: user.id },
      include: { achievement: true },
      orderBy: { achievement: { xpReward: "desc" } },
      take: 6,
    });

    const svg = generateShowcaseCard({
      userName: userData?.name || "D2D User",
      userLevel,
      totalXp: stats?.totalXp || 0,
      currentStreak: stats?.currentStreak || 0,
      tasksCompleted: stats?.tasksCompleted || 0,
      achievements: userAchievements.map((ua) => ({
        name: ua.achievement.name,
        icon: ua.achievement.icon,
      })),
    });

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=300",
      },
    });
  })

  // Generate milestone celebration card
  .get(
    "/milestone-card",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      const { type, value } = query;

      const userData = await db.user.findUnique({
        where: { id: user.id },
        select: { name: true },
      });

      const stats = await db.userStats.findUnique({ where: { userId: user.id } });
      const userLevel = calculateLevel(stats?.totalXp || 0);

      const milestoneLabels: Record<string, string> = {
        tasks: "Tasks Completed",
        streak: "Day Streak",
        xp: "XP Earned",
        level: "Level Reached",
      };

      const svg = generateMilestoneCard({
        userName: userData?.name || "D2D User",
        userLevel,
        milestoneType: milestoneLabels[type] || type,
        milestoneValue: parseInt(value, 10),
      });

      return new Response(svg, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=3600",
        },
      });
    },
    {
      query: t.Object({
        type: t.String(),
        value: t.String(),
      }),
    }
  )

  // Seed default achievements
  .post("/seed", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const existing = await db.achievement.count();
    if (existing > 0) {
      return { message: "Achievements already seeded", count: existing };
    }

    const achievements = [
      // Task achievements
      { name: "First Step", description: "Complete your first task", icon: "🎯", category: "TASKS", criteria: { targetValue: 1, type: "tasksCompleted" }, xpReward: 10 },
      { name: "Task Rookie", description: "Complete 10 tasks", icon: "✅", category: "TASKS", criteria: { targetValue: 10, type: "tasksCompleted" }, xpReward: 25 },
      { name: "Task Pro", description: "Complete 50 tasks", icon: "🏆", category: "TASKS", criteria: { targetValue: 50, type: "tasksCompleted" }, xpReward: 100 },
      { name: "Century Club", description: "Complete 100 tasks", icon: "💯", category: "TASKS", criteria: { targetValue: 100, type: "tasksCompleted" }, xpReward: 200 },
      { name: "Task Master", description: "Complete 500 tasks", icon: "👑", category: "TASKS", criteria: { targetValue: 500, type: "tasksCompleted" }, xpReward: 500 },
      
      // Streak achievements
      { name: "Getting Started", description: "Achieve a 3-day streak", icon: "🔥", category: "STREAK", criteria: { targetValue: 3, type: "streak" }, xpReward: 25 },
      { name: "Week Warrior", description: "Achieve a 7-day streak", icon: "🔥", category: "STREAK", criteria: { targetValue: 7, type: "streak" }, xpReward: 75 },
      { name: "Consistent", description: "Achieve a 14-day streak", icon: "⚡", category: "STREAK", criteria: { targetValue: 14, type: "streak" }, xpReward: 150 },
      { name: "Monthly Master", description: "Achieve a 30-day streak", icon: "🌟", category: "STREAK", criteria: { targetValue: 30, type: "streak" }, xpReward: 300 },
      { name: "Iron Discipline", description: "Achieve a 100-day streak", icon: "💎", category: "STREAK", criteria: { targetValue: 100, type: "streak" }, xpReward: 1000 },
      
      // XP achievements
      { name: "XP Beginner", description: "Earn 500 XP", icon: "⭐", category: "XP", criteria: { targetValue: 500, type: "totalXp" }, xpReward: 25 },
      { name: "XP Collector", description: "Earn 2000 XP", icon: "🌟", category: "XP", criteria: { targetValue: 2000, type: "totalXp" }, xpReward: 50 },
      { name: "XP Champion", description: "Earn 10000 XP", icon: "🏅", category: "XP", criteria: { targetValue: 10000, type: "totalXp" }, xpReward: 200 },
      
      // Social achievements
      { name: "Team Player", description: "Join your first clan", icon: "👥", category: "SOCIAL", criteria: { targetValue: 1, type: "clansJoined" }, xpReward: 25 },
      { name: "Helper", description: "Complete 10 clan tasks", icon: "🤝", category: "SOCIAL", criteria: { targetValue: 10, type: "clanTasks" }, xpReward: 75 },
      
      // Nutrition achievements
      { name: "Fuel Up", description: "Log nutrition for 7 days", icon: "🥗", category: "NUTRITION", criteria: { targetValue: 7, type: "nutritionDays" }, xpReward: 50 },
      { name: "Health Conscious", description: "Log nutrition for 30 days", icon: "💪", category: "NUTRITION", criteria: { targetValue: 30, type: "nutritionDays" }, xpReward: 150 },
    ];

    for (const a of achievements) {
      await db.achievement.create({
        data: {
          name: a.name,
          description: a.description,
          icon: a.icon,
          category: a.category,
          criteria: JSON.stringify(a.criteria),
          xpReward: a.xpReward,
        },
      });
    }

    return { message: "Achievements seeded", count: achievements.length };
  });

// Helper: Calculate achievement progress from criteria JSON
function calculateAchievementProgress(
  achievement: { category: string; criteria: string },
  stats: { totalXp?: number; tasksCompleted?: number; currentStreak?: number; longestStreak?: number } | null
): { current: number; target: number; percent: number } {
  let current = 0;
  let targetValue = 1;

  // Parse criteria JSON
  try {
    const criteria = JSON.parse(achievement.criteria);
    targetValue = criteria.targetValue || criteria.count || criteria.target || 1;
  } catch {
    targetValue = 1;
  }

  switch (achievement.category) {
    case "TASKS":
    case "tasks":
      current = stats?.tasksCompleted || 0;
      break;
    case "STREAK":
    case "streaks":
      current = Math.max(stats?.currentStreak || 0, stats?.longestStreak || 0);
      break;
    case "XP":
    case "xp":
      current = stats?.totalXp || 0;
      break;
    default:
      current = 0;
  }

  return {
    current: Math.min(current, targetValue),
    target: targetValue,
    percent: Math.min(100, Math.round((current / targetValue) * 100)),
  };
}

// Helper: Calculate level
function calculateLevel(xp: number): number {
  if (xp < 1000) return Math.floor(xp / 100) + 1;
  if (xp < 4000) return 10 + Math.floor((xp - 1000) / 200);
  if (xp < 16500) return 25 + Math.floor((xp - 4000) / 500);
  return 50 + Math.floor((xp - 16500) / 1000);
}

// SVG Card Generators
function generateAchievementCard(params: {
  achievementName: string;
  achievementDescription: string;
  achievementIcon: string;
  userName: string;
  userLevel: number;
  unlockedAt: Date;
  xpReward: number;
}): string {
  const formattedDate = params.unlockedAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea"/>
      <stop offset="100%" style="stop-color:#764ba2"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-opacity="0.3"/>
    </filter>
  </defs>
  
  <rect width="400" height="200" rx="16" fill="url(#bg)"/>
  
  <text x="30" y="40" font-family="system-ui, sans-serif" font-size="12" fill="rgba(255,255,255,0.8)">ACHIEVEMENT UNLOCKED</text>
  
  <text x="30" y="85" font-family="system-ui, sans-serif" font-size="48">${params.achievementIcon}</text>
  
  <text x="100" y="80" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" fill="white">${escapeXml(params.achievementName)}</text>
  <text x="100" y="105" font-family="system-ui, sans-serif" font-size="14" fill="rgba(255,255,255,0.9)">${escapeXml(params.achievementDescription)}</text>
  
  <text x="100" y="135" font-family="system-ui, sans-serif" font-size="14" fill="rgba(255,255,255,0.7)">+${params.xpReward} XP</text>
  
  <line x1="30" y1="155" x2="370" y2="155" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
  
  <text x="30" y="180" font-family="system-ui, sans-serif" font-size="12" fill="rgba(255,255,255,0.8)">${escapeXml(params.userName)} • Level ${params.userLevel}</text>
  <text x="370" y="180" font-family="system-ui, sans-serif" font-size="12" fill="rgba(255,255,255,0.6)" text-anchor="end">${formattedDate}</text>
  
  <text x="370" y="40" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="white" text-anchor="end">D2D</text>
</svg>`;
}

function generateShowcaseCard(params: {
  userName: string;
  userLevel: number;
  totalXp: number;
  currentStreak: number;
  tasksCompleted: number;
  achievements: Array<{ name: string; icon: string }>;
}): string {
  const achievementIcons = params.achievements.map((a, i) => 
    `<text x="${50 + i * 55}" y="145" font-size="28">${a.icon}</text>`
  ).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250" viewBox="0 0 400 250">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#16213e"/>
    </linearGradient>
  </defs>
  
  <rect width="400" height="250" rx="16" fill="url(#bg)"/>
  
  <text x="30" y="45" font-family="system-ui, sans-serif" font-size="24" font-weight="bold" fill="white">${escapeXml(params.userName)}</text>
  <text x="30" y="70" font-family="system-ui, sans-serif" font-size="14" fill="#667eea">Level ${params.userLevel}</text>
  
  <text x="370" y="45" font-family="system-ui, sans-serif" font-size="16" font-weight="bold" fill="#667eea" text-anchor="end">D2D</text>
  
  <rect x="30" y="85" width="100" height="35" rx="8" fill="rgba(102,126,234,0.2)"/>
  <text x="80" y="100" font-family="system-ui, sans-serif" font-size="10" fill="rgba(255,255,255,0.6)" text-anchor="middle">XP</text>
  <text x="80" y="115" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="white" text-anchor="middle">${params.totalXp.toLocaleString()}</text>
  
  <rect x="145" y="85" width="100" height="35" rx="8" fill="rgba(102,126,234,0.2)"/>
  <text x="195" y="100" font-family="system-ui, sans-serif" font-size="10" fill="rgba(255,255,255,0.6)" text-anchor="middle">STREAK</text>
  <text x="195" y="115" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="white" text-anchor="middle">${params.currentStreak} 🔥</text>
  
  <rect x="260" y="85" width="110" height="35" rx="8" fill="rgba(102,126,234,0.2)"/>
  <text x="315" y="100" font-family="system-ui, sans-serif" font-size="10" fill="rgba(255,255,255,0.6)" text-anchor="middle">TASKS</text>
  <text x="315" y="115" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="white" text-anchor="middle">${params.tasksCompleted}</text>
  
  ${achievementIcons}
  
  <text x="30" y="185" font-family="system-ui, sans-serif" font-size="10" fill="rgba(255,255,255,0.5)">TOP ACHIEVEMENTS</text>
  
  <text x="200" y="230" font-family="system-ui, sans-serif" font-size="12" fill="rgba(255,255,255,0.4)" text-anchor="middle">Daily Discipline & Decisions</text>
</svg>`;
}

function generateMilestoneCard(params: {
  userName: string;
  userLevel: number;
  milestoneType: string;
  milestoneValue: number;
}): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f093fb"/>
      <stop offset="100%" style="stop-color:#f5576c"/>
    </linearGradient>
  </defs>
  
  <rect width="400" height="200" rx="16" fill="url(#bg)"/>
  
  <text x="200" y="40" font-family="system-ui, sans-serif" font-size="12" fill="rgba(255,255,255,0.8)" text-anchor="middle">🎉 MILESTONE REACHED 🎉</text>
  
  <text x="200" y="95" font-family="system-ui, sans-serif" font-size="48" font-weight="bold" fill="white" text-anchor="middle">${params.milestoneValue.toLocaleString()}</text>
  <text x="200" y="125" font-family="system-ui, sans-serif" font-size="18" fill="rgba(255,255,255,0.9)" text-anchor="middle">${escapeXml(params.milestoneType)}</text>
  
  <line x1="50" y1="150" x2="350" y2="150" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
  
  <text x="200" y="175" font-family="system-ui, sans-serif" font-size="14" fill="rgba(255,255,255,0.8)" text-anchor="middle">${escapeXml(params.userName)} • Level ${params.userLevel}</text>
  
  <text x="370" y="30" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="white" text-anchor="end">D2D</text>
</svg>`;
}

// Helper: Escape XML special characters
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
