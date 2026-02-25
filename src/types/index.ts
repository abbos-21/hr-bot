export interface JwtPayload {
  adminId: string;
  email: string;
  role: string;
}

export interface WsMessage {
  type:
    | "NEW_APPLICATION"
    | "NEW_MESSAGE"
    | "STATUS_CHANGE"
    | "CANDIDATE_UPDATE"
    | "MESSAGES_READ"
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
