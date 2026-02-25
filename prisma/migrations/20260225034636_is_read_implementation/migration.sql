-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "adminId" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'inbound',
    "type" TEXT NOT NULL DEFAULT 'text',
    "text" TEXT,
    "fileId" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "localPath" TEXT,
    "telegramMsgId" INTEGER,
    "isRead" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Message" ("adminId", "candidateId", "createdAt", "direction", "fileId", "fileName", "id", "localPath", "mimeType", "telegramMsgId", "text", "type") SELECT "adminId", "candidateId", "createdAt", "direction", "fileId", "fileName", "id", "localPath", "mimeType", "telegramMsgId", "text", "type" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
