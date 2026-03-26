-- DropIndex
DROP INDEX IF EXISTS "Candidate_botId_telegramId_key";

-- CreateIndex
CREATE INDEX "Candidate_botId_telegramId_idx" ON "Candidate"("botId", "telegramId");
