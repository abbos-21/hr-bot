/*
  Warnings:

  - You are about to drop the `QuestionTemplate` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `QuestionTemplateItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `errorMessage` on the `Question` table. All the data in the column will be lost.
  - You are about to drop the column `sourceQuestionId` on the `Question` table. All the data in the column will be lost.
  - You are about to drop the column `sourceTemplateId` on the `Question` table. All the data in the column will be lost.
  - You are about to drop the column `successMessage` on the `Question` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "QuestionTranslation" ADD COLUMN "errorMessage" TEXT;
ALTER TABLE "QuestionTranslation" ADD COLUMN "successMessage" TEXT;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "QuestionTemplate";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "QuestionTemplateItem";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "botId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "fieldKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Question_botId_fkey" FOREIGN KEY ("botId") REFERENCES "Bot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Question" ("botId", "createdAt", "fieldKey", "id", "isActive", "isRequired", "order", "type", "updatedAt") SELECT "botId", "createdAt", "fieldKey", "id", "isActive", "isRequired", "order", "type", "updatedAt" FROM "Question";
DROP TABLE "Question";
ALTER TABLE "new_Question" RENAME TO "Question";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
