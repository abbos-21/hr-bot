export interface JwtPayload {
  adminId: string;
  login: string;
  role: string;
  type: "admin" | "organization";
  organizationId?: string;
  botId?: string;
}

export interface WsMessage {
  type:
    | "NEW_APPLICATION"
    | "NEW_MESSAGE"
    | "STATUS_CHANGE"
    | "CANDIDATE_UPDATE"
    | "MESSAGES_READ"
    | "MEETING_CREATED"
    | "MEETING_UPDATED"
    | "MEETING_DELETED"
    | "PING";
  payload?: unknown;
}

export interface BotContext {
  botId: string;
  telegramId: string;
  lang: string;
  candidateId?: string;
  jobId?: string;
  step: number;
}
