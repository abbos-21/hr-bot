/*
  Warnings:

  - You are about to drop the `Job` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `JobTranslation` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `jobId` on the `Candidate` table. All the data in the column will be lost.
  - You are about to drop the column `jobId` on the `Question` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "JobTranslation_jobId_lang_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Job";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "JobTranslation";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Candidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "botId" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "username" TEXT,
    "fullName" TEXT,
    "age" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "profilePhoto" TEXT,
    "lang" TEXT NOT NULL DEFAULT 'en',
    "status" TEXT NOT NULL DEFAULT 'incomplete',
    "columnId" TEXT,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastActivity" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Candidate_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Candidate_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "KanbanColumn" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Candidate" ("age", "botId", "columnId", "createdAt", "currentStep", "email", "fullName", "id", "lang", "lastActivity", "phone", "status", "telegramId", "updatedAt", "username") SELECT "age", "botId", "columnId", "createdAt", "currentStep", "email", "fullName", "id", "lang", "lastActivity", "phone", "status", "telegramId", "updatedAt", "username" FROM "Candidate";
DROP TABLE "Candidate";
ALTER TABLE "new_Candidate" RENAME TO "Candidate";
CREATE UNIQUE INDEX "Candidate_botId_telegramId_key" ON "Candidate"("botId", "telegramId");
CREATE TABLE "new_Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "botId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "fieldKey" TEXT,
    "successMessage" TEXT,
    "errorMessage" TEXT,
    "sourceTemplateId" TEXT,
    "sourceQuestionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Question_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Question_sourceTemplateId_fkey" FOREIGN KEY ("sourceTemplateId") REFERENCES "QuestionTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Question" ("botId", "createdAt", "fieldKey", "id", "isActive", "order", "sourceQuestionId", "sourceTemplateId", "type", "updatedAt") SELECT "botId", "createdAt", "fieldKey", "id", "isActive", "order", "sourceQuestionId", "sourceTemplateId", "type", "updatedAt" FROM "Question";
DROP TABLE "Question";
ALTER TABLE "new_Question" RENAME TO "Question";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
