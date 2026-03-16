-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CandidateComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "adminId" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CandidateComment_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CandidateComment_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CandidateComment" ("adminId", "candidateId", "createdAt", "id", "text") SELECT "adminId", "candidateId", "createdAt", "id", "text" FROM "CandidateComment";
DROP TABLE "CandidateComment";
ALTER TABLE "new_CandidateComment" RENAME TO "CandidateComment";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
