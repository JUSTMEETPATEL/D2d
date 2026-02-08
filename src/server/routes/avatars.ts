import { Elysia, t } from "elysia";
import { db } from "@/lib/db";
import { authPlugin } from "../plugins/auth";

// Default items that all users get
const DEFAULT_ITEMS = [
  { name: "Default Skin", category: "SKIN_TONE", rarity: "COMMON", isDefault: true },
  { name: "Default Hair", category: "HAIR", rarity: "COMMON", isDefault: true },
  { name: "Simple Background", category: "BACKGROUND", rarity: "COMMON", isDefault: true },
];

export const avatarsRoutes = new Elysia({ prefix: "/avatars" })
  .use(authPlugin)

  // Get user's avatar and equipped items
  .get("/", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    let avatar = await db.userAvatar.findUnique({
      where: { userId: user.id },
      include: {
        items: {
          include: { item: true },
        },
      },
    });

    // Create default avatar if not exists
    if (!avatar) {
      avatar = await createDefaultAvatar(user.id);
    }

    // Get equipped items
    const equipped = {
      skinTone: avatar.skinToneId ? await db.avatarItem.findUnique({ where: { id: avatar.skinToneId } }) : null,
      hair: avatar.hairId ? await db.avatarItem.findUnique({ where: { id: avatar.hairId } }) : null,
      face: avatar.faceId ? await db.avatarItem.findUnique({ where: { id: avatar.faceId } }) : null,
      top: avatar.topId ? await db.avatarItem.findUnique({ where: { id: avatar.topId } }) : null,
      bottom: avatar.bottomId ? await db.avatarItem.findUnique({ where: { id: avatar.bottomId } }) : null,
      accessory: avatar.accessoryId ? await db.avatarItem.findUnique({ where: { id: avatar.accessoryId } }) : null,
      background: avatar.backgroundId ? await db.avatarItem.findUnique({ where: { id: avatar.backgroundId } }) : null,
      effect: avatar.effectId ? await db.avatarItem.findUnique({ where: { id: avatar.effectId } }) : null,
    };

    return { avatar, equipped, ownedItems: avatar.items };
  })

  // Get avatar shop (available items)
  .get(
    "/shop",
    async ({ user, authError, query }) => {
      if (!user) return authError(401, "Unauthorized");

      // Get user's level
      const stats = await db.userStats.findUnique({ where: { userId: user.id } });
      const userLevel = calculateLevel(stats?.totalXp || 0);

      // Get owned item IDs
      const ownedItems = await db.userAvatarItem.findMany({
        where: { userId: user.id },
        select: { itemId: true },
      });
      const ownedIds = new Set(ownedItems.map((i) => i.itemId));

      // Get available items
      const items = await db.avatarItem.findMany({
        where: {
          levelRequired: { lte: userLevel },
          isDefault: false,
          ...(query.category && { category: query.category as "SKIN_TONE" | "HAIR" | "FACE" | "TOP" | "BOTTOM" | "ACCESSORY" | "BACKGROUND" | "EFFECT" }),
          ...(query.rarity && { rarity: query.rarity as "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY" }),
        },
        orderBy: [{ rarity: "desc" }, { xpCost: "asc" }],
      });

      const itemsWithOwnership = items.map((item) => ({
        ...item,
        owned: ownedIds.has(item.id),
        canAfford: (stats?.totalXp || 0) >= item.xpCost,
      }));

      return { items: itemsWithOwnership, userLevel, userXp: stats?.totalXp || 0 };
    },
    {
      query: t.Object({
        category: t.Optional(t.String()),
        rarity: t.Optional(t.String()),
      }),
    }
  )

  // Purchase an item with XP
  .post("/:itemId/purchase", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    const item = await db.avatarItem.findUnique({
      where: { id: params.itemId },
    });

    if (!item) return authError(404, "Item not found");

    // Check if already owned
    const existing = await db.userAvatarItem.findUnique({
      where: {
        userId_itemId: { userId: user.id, itemId: item.id },
      },
    });

    if (existing) return authError(400, "Item already owned");

    // Check level requirement
    const stats = await db.userStats.findUnique({ where: { userId: user.id } });
    const userLevel = calculateLevel(stats?.totalXp || 0);

    if (userLevel < item.levelRequired) {
      return authError(400, `Requires level ${item.levelRequired}`);
    }

    // Check XP balance (using lifetime XP, not spending it)
    if ((stats?.totalXp || 0) < item.xpCost) {
      return authError(400, `Insufficient XP. Need ${item.xpCost}, have ${stats?.totalXp || 0}`);
    }

    // Ensure avatar exists
    let avatar = await db.userAvatar.findUnique({ where: { userId: user.id } });
    if (!avatar) {
      avatar = await createDefaultAvatar(user.id);
    }

    // Add item to inventory
    const userItem = await db.userAvatarItem.create({
      data: {
        userId: user.id,
        itemId: item.id,
        acquiredBy: "PURCHASE",
      },
      include: { item: true },
    });

    return { success: true, item: userItem };
  })

  // Equip an item
  .post("/:itemId/equip", async ({ user, authError, params }) => {
    if (!user) return authError(401, "Unauthorized");

    // Check ownership
    const userItem = await db.userAvatarItem.findFirst({
      where: { userId: user.id, itemId: params.itemId },
      include: { item: true },
    });

    if (!userItem) return authError(404, "Item not owned");

    // Get category field mapping
    const categoryFieldMap: Record<string, string> = {
      SKIN_TONE: "skinToneId",
      HAIR: "hairId",
      FACE: "faceId",
      TOP: "topId",
      BOTTOM: "bottomId",
      ACCESSORY: "accessoryId",
      BACKGROUND: "backgroundId",
      EFFECT: "effectId",
    };

    const field = categoryFieldMap[userItem.item.category];
    if (!field) return authError(400, "Invalid item category");

    // Update avatar
    const avatar = await db.userAvatar.update({
      where: { userId: user.id },
      data: { [field]: params.itemId },
    });

    return { success: true, avatar };
  })

  // Unequip an item (by category)
  .delete(
    "/equip/:category",
    async ({ user, authError, params }) => {
      if (!user) return authError(401, "Unauthorized");

      const categoryFieldMap: Record<string, string> = {
        SKIN_TONE: "skinToneId",
        HAIR: "hairId",
        FACE: "faceId",
        TOP: "topId",
        BOTTOM: "bottomId",
        ACCESSORY: "accessoryId",
        BACKGROUND: "backgroundId",
        EFFECT: "effectId",
      };

      const field = categoryFieldMap[params.category.toUpperCase()];
      if (!field) return authError(400, "Invalid category");

      const avatar = await db.userAvatar.update({
        where: { userId: user.id },
        data: { [field]: null },
      });

      return { success: true, avatar };
    }
  )

  // Get user's inventory
  .get("/inventory", async ({ user, authError }) => {
    if (!user) return authError(401, "Unauthorized");

    const items = await db.userAvatarItem.findMany({
      where: { userId: user.id },
      include: { item: true },
      orderBy: [{ item: { category: "asc" } }, { item: { rarity: "desc" } }],
    });

    // Group by category
    const byCategory = items.reduce((acc, ui) => {
      const cat = ui.item.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(ui);
      return acc;
    }, {} as Record<string, typeof items>);

    return { items, byCategory };
  });

// Helper: Create default avatar for new user
async function createDefaultAvatar(userId: string) {
  // Get or create default items
  const defaultItems = await db.avatarItem.findMany({
    where: { isDefault: true },
  });

  // Create avatar
  const avatar = await db.userAvatar.create({
    data: {
      userId,
      skinToneId: defaultItems.find((i) => i.category === "SKIN_TONE")?.id,
      backgroundId: defaultItems.find((i) => i.category === "BACKGROUND")?.id,
    },
    include: { items: { include: { item: true } } },
  });

  // Grant default items to user
  for (const item of defaultItems) {
    await db.userAvatarItem.create({
      data: {
        userId,
        itemId: item.id,
        acquiredBy: "DEFAULT",
      },
    });
  }

  return avatar;
}

// Helper: Calculate level from XP
function calculateLevel(xp: number): number {
  if (xp < 1000) return Math.floor(xp / 100) + 1; // Levels 1-10
  if (xp < 4000) return 10 + Math.floor((xp - 1000) / 200); // Levels 11-25
  if (xp < 16500) return 25 + Math.floor((xp - 4000) / 500); // Levels 26-50
  return 50 + Math.floor((xp - 16500) / 1000); // Levels 51+
}
