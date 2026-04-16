-- AlterTable: add botId to KanbanColumn (nullable for backward compatibility)
-- Guarded: some databases already have this column from an earlier init migration
ALTER TABLE "KanbanColumn" ADD COLUMN IF NOT EXISTS "botId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KanbanColumn_botId_idx" ON "KanbanColumn"("botId");
