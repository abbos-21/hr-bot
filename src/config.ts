import dotenv from "dotenv";
import path from "path";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  jwtSecret: process.env.JWT_SECRET || "fallback-secret-change-in-production",
  uploadDir: path.resolve(process.env.UPLOAD_DIR || "./uploads"),
  nodeEnv: process.env.NODE_ENV || "development",
  webhookBaseUrl: process.env.WEBHOOK_BASE_URL || "",
  adminEmail: process.env.ADMIN_EMAIL || "admin@example.com",
  adminPassword: process.env.ADMIN_PASSWORD || "admin123",
};

export const CANDIDATE_STATUSES = [
  "incomplete", // still completing the survey bot
  "active", // in the pipeline (on kanban board, in a column)
  "hired", // offer accepted
  "archived", // no longer in pipeline
] as const;

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];
