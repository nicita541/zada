-- AlterTable
ALTER TABLE "notes" ADD COLUMN     "last_synced_at" TIMESTAMP(3),
ADD COLUMN     "local_only" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sync_enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "actual_result" TEXT,
ADD COLUMN     "build_version" TEXT,
ADD COLUMN     "engine" TEXT,
ADD COLUMN     "expected_result" TEXT,
ADD COLUMN     "game_area" TEXT,
ADD COLUMN     "platform" TEXT,
ADD COLUMN     "severity" TEXT,
ADD COLUMN     "steps_to_reproduce" TEXT;
