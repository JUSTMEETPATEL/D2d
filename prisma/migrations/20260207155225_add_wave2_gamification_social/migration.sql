-- CreateEnum
CREATE TYPE "ItemRarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('SKIN_TONE', 'HAIR', 'FACE', 'TOP', 'BOTTOM', 'ACCESSORY', 'BACKGROUND', 'EFFECT');

-- CreateEnum
CREATE TYPE "ChallengeType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'SEASONAL');

-- CreateEnum
CREATE TYPE "ChallengeCategory" AS ENUM ('TASKS', 'NUTRITION', 'HABITS', 'SOCIAL', 'STREAK', 'FOCUS', 'MIXED');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PrivacyLevel" AS ENUM ('PUBLIC', 'FRIENDS_ONLY', 'PRIVATE');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "privacyLevel" "PrivacyLevel" NOT NULL DEFAULT 'PUBLIC';

-- CreateTable
CREATE TABLE "avatar_item" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "ItemCategory" NOT NULL,
    "rarity" "ItemRarity" NOT NULL DEFAULT 'COMMON',
    "imageUrl" TEXT NOT NULL,
    "previewUrl" TEXT,
    "levelRequired" INTEGER NOT NULL DEFAULT 1,
    "xpCost" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isLimited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avatar_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_avatar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skinToneId" TEXT,
    "hairId" TEXT,
    "faceId" TEXT,
    "topId" TEXT,
    "bottomId" TEXT,
    "accessoryId" TEXT,
    "backgroundId" TEXT,
    "effectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_avatar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_avatar_item" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acquiredBy" TEXT NOT NULL DEFAULT 'PURCHASE',

    CONSTRAINT "user_avatar_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge" (
    "id" TEXT NOT NULL,
    "type" "ChallengeType" NOT NULL,
    "category" "ChallengeCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "xpReward" INTEGER NOT NULL DEFAULT 50,
    "itemRewardId" TEXT,
    "levelRequired" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_progress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "currentValue" INTEGER NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "isClaimed" BOOLEAN NOT NULL DEFAULT false,
    "claimedAt" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clan_challenge" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "xpMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "bonusXp" INTEGER NOT NULL DEFAULT 100,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "currentValue" INTEGER NOT NULL DEFAULT 0,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clan_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "published_template" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[],
    "templateData" JSONB NOT NULL,
    "status" "TemplateStatus" NOT NULL DEFAULT 'PENDING',
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "published_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_vote" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isUpvote" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_comment" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avatar_item_category_rarity_idx" ON "avatar_item"("category", "rarity");

-- CreateIndex
CREATE UNIQUE INDEX "user_avatar_userId_key" ON "user_avatar"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_avatar_item_userId_itemId_key" ON "user_avatar_item"("userId", "itemId");

-- CreateIndex
CREATE INDEX "challenge_type_isActive_idx" ON "challenge"("type", "isActive");

-- CreateIndex
CREATE INDEX "challenge_progress_userId_isCompleted_idx" ON "challenge_progress"("userId", "isCompleted");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_progress_userId_challengeId_periodStart_key" ON "challenge_progress"("userId", "challengeId", "periodStart");

-- CreateIndex
CREATE INDEX "clan_challenge_clanId_isCompleted_idx" ON "clan_challenge"("clanId", "isCompleted");

-- CreateIndex
CREATE INDEX "published_template_category_status_idx" ON "published_template"("category", "status");

-- CreateIndex
CREATE INDEX "published_template_authorId_idx" ON "published_template"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "template_vote_templateId_userId_key" ON "template_vote"("templateId", "userId");

-- CreateIndex
CREATE INDEX "template_comment_templateId_createdAt_idx" ON "template_comment"("templateId", "createdAt");

-- AddForeignKey
ALTER TABLE "user_avatar" ADD CONSTRAINT "user_avatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_avatar_item" ADD CONSTRAINT "user_avatar_item_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user_avatar"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_avatar_item" ADD CONSTRAINT "user_avatar_item_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "avatar_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_progress" ADD CONSTRAINT "challenge_progress_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_vote" ADD CONSTRAINT "template_vote_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "published_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_comment" ADD CONSTRAINT "template_comment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "published_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
