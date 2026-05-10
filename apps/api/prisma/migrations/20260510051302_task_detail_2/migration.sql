-- AlterTable
ALTER TABLE "reminders" ADD COLUMN     "dismissed_at" TIMESTAMP(3),
ADD COLUMN     "habit_id" UUID,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'task';

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "estimated_minutes" INTEGER;

-- CreateIndex
CREATE INDEX "reminders_task_id_idx" ON "reminders"("task_id");

-- CreateIndex
CREATE INDEX "reminders_user_id_remind_at_idx" ON "reminders"("user_id", "remind_at");
