import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

// Auth
export const authApi = {
  login: (login: string, password: string) =>
    api.post("/auth/login", { login, password }).then((r) => r.data),
  me: () => api.get("/auth/me").then((r) => r.data),
  updateProfile: (data: any) =>
    api.put("/auth/profile", data).then((r) => r.data),
  getAdmins: () => api.get("/auth/admins").then((r) => r.data),
  createAdmin: (data: any) =>
    api.post("/auth/admins", data).then((r) => r.data),
  updateAdmin: (id: string, data: any) =>
    api.put(`/auth/admins/${id}`, data).then((r) => r.data),
};

// Bots
export const botsApi = {
  list: () => api.get("/bots").then((r) => r.data),
  get: (id: string) => api.get(`/bots/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/bots", data).then((r) => r.data),
  update: (id: string, data: any) =>
    api.put(`/bots/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/bots/${id}`).then((r) => r.data),
  getLanguages: (botId: string) =>
    api.get(`/bots/${botId}/languages`).then((r) => r.data),
  addLanguage: (botId: string, data: any) =>
    api.post(`/bots/${botId}/languages`, data).then((r) => r.data),
  deleteLanguage: (botId: string, langId: string) =>
    api.delete(`/bots/${botId}/languages/${langId}`).then((r) => r.data),
  updateToken: (id: string, token: string) =>
    api.put(`/bots/${id}/token`, { token }).then((r) => r.data),
  getMessages: (id: string) =>
    api.get(`/bots/${id}/bot-messages`).then((r) => r.data),
  saveMessages: (
    id: string,
    items: { lang: string; key: string; value: string }[],
  ) => api.put(`/bots/${id}/bot-messages`, items).then((r) => r.data),
};

// Questions
export const questionsApi = {
  list: (params?: { botId?: string }) =>
    api.get("/questions", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/questions/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/questions", data).then((r) => r.data),
  update: (id: string, data: any) =>
    api.put(`/questions/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/questions/${id}`).then((r) => r.data),
  reorder: (questions: { id: string; order: number }[]) =>
    api.put("/questions/batch/reorder", { questions }).then((r) => r.data),
  reorderBranch: (questions: { id: string; branchOrder: number }[]) =>
    api.put("/questions/batch/reorder", { questions }).then((r) => r.data),
  toggleOption: (questionId: string, optionId: string, isActive: boolean) =>
    api
      .put(`/questions/${questionId}/options/${optionId}`, { isActive })
      .then((r) => r.data),
};

// Candidates
export const candidatesApi = {
  list: (params?: any) =>
    api.get("/candidates", { params }).then((r) => r.data),
  get: (id: string) => api.get(`/candidates/${id}`).then((r) => r.data),
  update: (id: string, data: any) =>
    api.put(`/candidates/${id}`, data).then((r) => r.data),
  addComment: (id: string, text: string) =>
    api.post(`/candidates/${id}/comments`, { text }).then((r) => r.data),
  deleteComment: (candidateId: string, commentId: string) =>
    api
      .delete(`/candidates/${candidateId}/comments/${commentId}`)
      .then((r) => r.data),
  updateAnswer: (candidateId: string, answerId: string, data: any) =>
    api
      .put(`/candidates/${candidateId}/answers/${answerId}`, data)
      .then((r) => r.data),
  delete: (id: string) => api.delete(`/candidates/${id}`).then((r) => r.data),
};

// Messages
export const messagesApi = {
  conversations: () => api.get("/messages/conversations").then((r) => r.data),
  list: (candidateId: string) =>
    api.get(`/messages/${candidateId}`).then((r) => r.data),
  send: (candidateId: string, data: any) =>
    api.post(`/messages/${candidateId}`, data).then((r) => r.data),
  sendMedia: (
    candidateId: string,
    file: File,
    messageType: string,
    caption?: string,
  ) => {
    const form = new FormData();
    form.append("file", file);
    form.append("messageType", messageType);
    if (caption) form.append("caption", caption);
    return api
      .post(`/messages/${candidateId}/media`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },
  markAsRead: (candidateId: string) =>
    api.post(`/messages/${candidateId}/read`).then((r) => r.data),
  broadcast: (candidateIds: string[], text: string) =>
    api.post("/messages/broadcast", { candidateIds, text }, { timeout: 120000 }).then((r) => r.data),
};

// Analytics
export const analyticsApi = {
  overview: (botId?: string) =>
    api.get("/analytics/overview", { params: { botId } }).then((r) => r.data),
  perJob: (botId?: string) =>
    api.get("/analytics/per-job", { params: { botId } }).then((r) => r.data),
  activity: (botId?: string, days?: number) =>
    api
      .get("/analytics/activity", { params: { botId, days } })
      .then((r) => r.data),
  funnel: (botId?: string) =>
    api.get("/analytics/funnel", { params: { botId } }).then((r) => r.data),
  completionRate: (botId?: string) =>
    api
      .get("/analytics/completion-rate", { params: { botId } })
      .then((r) => r.data),
};

// Files
export const filesApi = {
  // Include the JWT as a query param so browser <img>, <audio>, and <a href>
  // can fetch these URLs directly without custom headers.
  downloadUrl: (fileId: string) => {
    const token = localStorage.getItem("token") || "";
    return `${API_BASE}/files/download/${fileId}?token=${token}`;
  },
  serveUrl: (messageId: string) => {
    const token = localStorage.getItem("token") || "";
    return `${API_BASE}/files/serve/${messageId}?token=${token}`;
  },
  serveFileUrl: (fileId: string) => {
    const token = localStorage.getItem("token") || "";
    return `${API_BASE}/files/serve-file/${fileId}?token=${token}`;
  },
  messageDownloadUrl: (messageId: string) => {
    const token = localStorage.getItem("token") || "";
    return `${API_BASE}/files/message/${messageId}?token=${token}`;
  },
};
// Meetings
export const meetingsApi = {
  list: (candidateId: string) =>
    api.get("/meetings", { params: { candidateId } }).then((r) => r.data),
  create: (data: {
    candidateId: string;
    scheduledAt: string;
    note?: string;
    reminderMinutes?: number;
  }) => api.post("/meetings", data).then((r) => r.data),
  update: (id: string, data: any) =>
    api.put(`/meetings/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/meetings/${id}`).then((r) => r.data),
};

// Organizations
export const organizationsApi = {
  list: () => api.get("/organizations").then((r) => r.data),
  listDeleted: () =>
    api.get("/organizations?deleted=true").then((r) => r.data),
  get: (id: string) => api.get(`/organizations/${id}`).then((r) => r.data),
  create: (data: any) => api.post("/organizations", data).then((r) => r.data),
  update: (id: string, data: any) =>
    api.put(`/organizations/${id}`, data).then((r) => r.data),
  delete: (id: string) =>
    api.delete(`/organizations/${id}`).then((r) => r.data),
  restore: (id: string) =>
    api.post(`/organizations/${id}/restore`).then((r) => r.data),
  assignBot: (id: string, botId: string) =>
    api.put(`/organizations/${id}/bot`, { botId }).then((r) => r.data),
  unlinkBot: (id: string) =>
    api.delete(`/organizations/${id}/bot`).then((r) => r.data),
};

// Branches
export const branchesApi = {
  list: (organizationId?: string) =>
    api
      .get("/branches", { params: organizationId ? { organizationId } : {} })
      .then((r) => r.data),
  create: (data: any) => api.post("/branches", data).then((r) => r.data),
  update: (id: string, data: any) =>
    api.put(`/branches/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/branches/${id}`).then((r) => r.data),
};

export const columnsApi = {
  list: (botId?: string) =>
    api.get("/columns", { params: botId ? { botId } : {} }).then((r) => r.data),
  archived: (botId?: string) =>
    api.get("/columns/archived", { params: botId ? { botId } : {} }).then((r) => r.data),
  create: (data: any) => api.post("/columns", data).then((r) => r.data),
  update: (id: string, data: any) =>
    api.put(`/columns/${id}`, data).then((r) => r.data),
  reorder: (columns: any[]) =>
    api.put("/columns/reorder", { columns }).then((r) => r.data),
  archive: (id: string) =>
    api.post(`/columns/${id}/archive`).then((r) => r.data),
  restore: (id: string) =>
    api.post(`/columns/${id}/restore`).then((r) => r.data),
  delete: (id: string) => api.delete(`/columns/${id}`).then((r) => r.data),
};
