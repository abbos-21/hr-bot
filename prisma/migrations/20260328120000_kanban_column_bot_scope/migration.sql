-- AlterTable: add botId to KanbanColumn (nullable for backward compatibility)
ALTER TABLE "KanbanColumn" ADD COLUMN "botId" TEXT;

-- CreateIndex
CREATE INDEX "KanbanColumn_botId_idx" ON "KanbanColumn"("botId");
