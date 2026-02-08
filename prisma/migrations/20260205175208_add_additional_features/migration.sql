-- CreateEnum
CREATE TYPE "BurnoutSignalType" AS ENUM ('COMPLETION_DROP', 'HIGH_SNOOZE_RATE', 'LOW_ENERGY_STREAK', 'TASK_DELAY_PATTERN', 'RECOVERY_SUGGESTED');

-- CreateEnum
CREATE TYPE "BreakType" AS ENUM ('SHORT', 'MEDIUM', 'LONG', 'RECOVERY');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'PAUSED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "JournalPromptType" AS ENUM ('WEEKLY', 'MONTHLY', 'MILESTONE', 'DAILY');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('SAVED', 'APPLIED', 'PHONE_SCREEN', 'INTERVIEW', 'FINAL_ROUND', 'OFFER', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "task_template" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'General',
    "icon" TEXT NOT NULL DEFAULT '📋',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "tasks" JSONB NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_plan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "tasksPlanned" INTEGER NOT NULL DEFAULT 0,
    "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
    "completionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "planningCompleted" BOOLEAN NOT NULL DEFAULT false,
    "planningCompletedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_priority" (
    "id" TEXT NOT NULL,
    "weeklyPlanId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_priority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "burnout_signal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signalType" "BurnoutSignalType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "message" TEXT,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "burnout_signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_mode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "reducedTaskTarget" INTEGER NOT NULL DEFAULT 3,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "recovery_mode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "focus_session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "plannedMinutes" INTEGER NOT NULL DEFAULT 25,
    "actualMinutes" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "focus_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "break_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "breakType" "BreakType" NOT NULL,
    "duration" INTEGER NOT NULL,
    "activity" TEXT,
    "triggeredBy" TEXT,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "break_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'General',
    "targetDate" TIMESTAMP(3),
    "totalTasks" INTEGER NOT NULL DEFAULT 0,
    "completedTasks" INTEGER NOT NULL DEFAULT 0,
    "progressPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_milestone" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "linkedTaskIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_prompt" (
    "id" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "type" "JournalPromptType" NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'reflection',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_prompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "promptId" TEXT,
    "promptText" TEXT,
    "content" TEXT NOT NULL,
    "mood" INTEGER,
    "isSharedToClan" BOOLEAN NOT NULL DEFAULT false,
    "sharedClanId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "url" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFollowUp" TIMESTAMP(3),
    "nextFollowUp" TIMESTAMP(3),
    "followUpCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clan_task" (
    "id" TEXT NOT NULL,
    "clanId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'General',
    "dueAt" TIMESTAMP(3),
    "xpReward" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clan_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clan_task_completion" (
    "id" TEXT NOT NULL,
    "clanTaskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clan_task_completion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sleep_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sleepStart" TIMESTAMP(3) NOT NULL,
    "sleepEnd" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL,
    "quality" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sleep_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mood_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "emoji" TEXT,
    "note" TEXT,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mood_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_template_userId_idx" ON "task_template"("userId");

-- CreateIndex
CREATE INDEX "task_template_isPublic_category_idx" ON "task_template"("isPublic", "category");

-- CreateIndex
CREATE INDEX "weekly_plan_userId_weekStart_idx" ON "weekly_plan"("userId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_plan_userId_weekStart_key" ON "weekly_plan"("userId", "weekStart");

-- CreateIndex
CREATE INDEX "weekly_priority_weeklyPlanId_idx" ON "weekly_priority"("weeklyPlanId");

-- CreateIndex
CREATE INDEX "burnout_signal_userId_createdAt_idx" ON "burnout_signal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "burnout_signal_userId_acknowledged_idx" ON "burnout_signal"("userId", "acknowledged");

-- CreateIndex
CREATE INDEX "recovery_mode_userId_active_idx" ON "recovery_mode"("userId", "active");

-- CreateIndex
CREATE INDEX "focus_session_userId_createdAt_idx" ON "focus_session"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "focus_session_userId_taskId_idx" ON "focus_session"("userId", "taskId");

-- CreateIndex
CREATE INDEX "break_log_userId_loggedAt_idx" ON "break_log"("userId", "loggedAt");

-- CreateIndex
CREATE INDEX "goal_userId_status_idx" ON "goal"("userId", "status");

-- CreateIndex
CREATE INDEX "goal_milestone_goalId_idx" ON "goal_milestone"("goalId");

-- CreateIndex
CREATE INDEX "journal_prompt_type_isActive_idx" ON "journal_prompt"("type", "isActive");

-- CreateIndex
CREATE INDEX "journal_entry_userId_createdAt_idx" ON "journal_entry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "application_userId_status_idx" ON "application"("userId", "status");

-- CreateIndex
CREATE INDEX "application_userId_nextFollowUp_idx" ON "application"("userId", "nextFollowUp");

-- CreateIndex
CREATE INDEX "clan_task_clanId_dueAt_idx" ON "clan_task"("clanId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "clan_task_completion_clanTaskId_userId_key" ON "clan_task_completion"("clanTaskId", "userId");

-- CreateIndex
CREATE INDEX "sleep_log_userId_sleepStart_idx" ON "sleep_log"("userId", "sleepStart");

-- CreateIndex
CREATE INDEX "mood_log_userId_loggedAt_idx" ON "mood_log"("userId", "loggedAt");

-- AddForeignKey
ALTER TABLE "weekly_priority" ADD CONSTRAINT "weekly_priority_weeklyPlanId_fkey" FOREIGN KEY ("weeklyPlanId") REFERENCES "weekly_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_milestone" ADD CONSTRAINT "goal_milestone_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clan_task_completion" ADD CONSTRAINT "clan_task_completion_clanTaskId_fkey" FOREIGN KEY ("clanTaskId") REFERENCES "clan_task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
