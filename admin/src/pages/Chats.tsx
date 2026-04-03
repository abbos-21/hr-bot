import React, { useEffect, useRef, useState, useCallback } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { messagesApi, filesApi, botsApi } from "../api";
import { useWebSocket } from "../hooks/useWebSocket";
import { CandidateDetailPanel } from "../components/Candidatedetailpanel";
import { useAuthStore } from "../store/auth";
import toast from "react-hot-toast";
import { useT } from "../i18n";
import { isViewableInBrowser } from "../utils/media";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatConvTime(dateStr: string, t: (key: string) => string) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return t("common.yesterday");
  return format(d, "MMM d");
}

function candidateName(c: any, t: (key: string) => string) {
  return c.fullName || (c.username ? `@${c.username}` : t("common.unknown"));
}

function candidateInitials(c: any) {
  const name = c.fullName || c.username || "?";
  return name
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function avatarGradient(id: string) {
  const gradients = [
    "from-blue-400 to-indigo-500",
    "from-emerald-400 to-teal-500",
    "from-pink-400 to-rose-500",
    "from-amber-400 to-orange-500",
    "from-purple-400 to-violet-500",
    "from-cyan-400 to-sky-500",
  ];
  return gradients[id.charCodeAt(0) % gradients.length];
}

function lastMsgPreview(msg: any, t: (key: string) => string) {
  if (!msg) return t("chats.noMessages");
  if (msg.type === "text") return msg.text || "…";
  if (msg.type === "photo") return t("chats.photo");
  if (msg.type === "document") return `📎 ${msg.fileName || t("candidates.panel.fileFallback")}`;
  if (msg.type === "voice") return t("chats.voice");
  if (msg.type === "video") return t("chats.video");
  if (msg.type === "audio") return t("chats.audio");
  return t("chats.attachment");
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

const Avatar: React.FC<{ conv: any; size?: "sm" | "md" | "lg" }> = ({
  conv,
  size = "md",
}) => {
  const sizeClass =
    size === "sm"
      ? "w-8 h-8 text-xs"
      : size === "lg"
        ? "w-12 h-12 text-base"
        : "w-10 h-10 text-sm";
  return (
    <div
      className={`${sizeClass} rounded-full bg-gradient-to-br ${avatarGradient(conv.id)} flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0`}
    >
      {conv.profilePhoto ? (
        <img
          src={`/uploads/${conv.botId}/${conv.profilePhoto.split(/[\\/]/).pop()}`}
          className="w-full h-full object-cover"
          alt=""
        />
      ) : (
        candidateInitials(conv)
      )}
    </div>
  );
};

// ─── Message Bubble ───────────────────────────────────────────────────────────

const MessageBubble: React.FC<{
  msg: any;
  onImageClick?: (src: string) => void;
}> = ({ msg, onImageClick }) => {
  const { t } = useT();
  const isOut = msg.direction === "outbound";

  const content = () => {
    if (msg.type === "text")
      return (
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {msg.text}
        </p>
      );
    if (msg.type === "photo")
      return (
        <img
          src={filesApi.serveUrl(msg.id)}
          alt="photo"
          className="max-w-full sm:max-w-[260px] max-h-[320px] rounded-xl object-cover cursor-zoom-in"
          onClick={() =>
            onImageClick && onImageClick(filesApi.serveUrl(msg.id))
          }
        />
      );
    if (msg.type === "voice")
      return (
        <div className="flex items-center gap-2">
          <span className="text-base">🎤</span>
          <audio
            controls
            src={filesApi.serveUrl(msg.id)}
            className="h-8 w-full max-w-[12rem]"
          />
        </div>
      );
    if (msg.type === "video")
      return (
        <video
          controls
          src={filesApi.serveUrl(msg.id)}
          className="max-w-full sm:max-w-[260px] max-h-[200px] rounded-xl"
        />
      );
    if (msg.type === "audio")
      return (
        <div className="flex items-center gap-2">
          <span className="text-base">🎵</span>
          <audio
            controls
            src={filesApi.serveUrl(msg.id)}
            className="h-8 w-full max-w-[12rem]"
          />
        </div>
      );
    if (msg.type === "document") {
      const viewable = isViewableInBrowser(msg.mimeType);
      return (
        <a
          href={filesApi.serveUrl(msg.id)}
          target="_blank"
          rel="noopener noreferrer"
          {...(!viewable ? { download: msg.fileName } : {})}
          className={`flex items-center gap-1.5 text-sm ${isOut ? "text-blue-100 hover:text-white" : "text-blue-600 hover:text-blue-700"}`}
        >
          {msg.mimeType === "application/pdf" ? "📄" : "📎"}{" "}
          {msg.fileName || t("candidates.panel.fileFallback")}
        </a>
      );
    }
    return <p className="text-sm text-gray-400 italic">{t("chats.attachment")}</p>;
  };

  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"} mb-1`}>
      <div
        className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 ${isOut ? "bg-blue-600 text-white rounded-tr-sm" : "bg-white text-gray-800 rounded-tl-sm shadow-sm border border-gray-100"}`}
      >
        {content()}
        <p
          className={`text-[11px] mt-1 ${isOut ? "text-blue-200" : "text-gray-400"}`}
        >
          {msg.direction === "outbound" && msg.admin?.name
            ? `${msg.admin.name} · `
            : ""}
          {format(new Date(msg.createdAt), "HH:mm")}
        </p>
      </div>
    </div>
  );
};

// ─── Day separator ────────────────────────────────────────────────────────────

const DaySeparator: React.FC<{ date: string }> = ({ date }) => {
  const { t } = useT();
  const d = new Date(date);
  const label = isToday(d)
    ? t("common.today")
    : isYesterday(d)
      ? t("common.yesterday")
      : format(d, "MMMM d, yyyy");
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-gray-100" />
      <span className="text-xs text-gray-400 font-medium bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
        {label}
      </span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
};

// ─── Main Chats Page ──────────────────────────────────────────────────────────

export const ChatsPage: React.FC = () => {
  const { t } = useT();
  const { isOrg } = useAuthStore();
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [bots, setBots] = useState<any[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string>("");

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadConversations = useCallback(() => {
    messagesApi
      .conversations()
      .then(setConversations)
      .finally(() => setLoadingConvs(false));
  }, []);

  useEffect(() => {
    loadConversations();
    // Admins: load bot list for filtering
    if (!isOrg()) {
      botsApi.list().then(setBots).catch(() => {});
    }
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) return;
    setLoadingMsgs(true);
    messagesApi
      .list(selectedId)
      .then(setMessages)
      .finally(() => setLoadingMsgs(false));
    messagesApi.markAsRead(selectedId).catch(() => {});
    setConversations((prev) =>
      prev.map((c) => (c.id === selectedId ? { ...c, unreadCount: 0 } : c)),
    );
  }, [selectedId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (selectedId) setTimeout(() => inputRef.current?.focus(), 100);
  }, [selectedId]);

  useWebSocket({
    NEW_MESSAGE: (payload) => {
      const { candidateId, message } = payload;
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === candidateId);
        if (!existing) {
          loadConversations();
          return prev;
        }
        const updated = {
          ...existing,
          lastMessage: message,
          lastActivity: message.createdAt,
          unreadCount:
            message.direction === "inbound" && candidateId !== selectedId
              ? (existing.unreadCount || 0) + 1
              : existing.unreadCount,
        };
        return [updated, ...prev.filter((c) => c.id !== candidateId)];
      });
      if (candidateId === selectedId && message.direction === "inbound") {
        setMessages((prev) =>
          prev.some((m) => m.id === message.id) ? prev : [...prev, message],
        );
        messagesApi.markAsRead(candidateId).catch(() => {});
      }
    },
    MESSAGES_READ: (payload) => {
      if (payload?.candidateId)
        setConversations((prev) =>
          prev.map((c) =>
            c.id === payload.candidateId ? { ...c, unreadCount: 0 } : c,
          ),
        );
    },
  });

  const handleSendMessage = async () => {
    if (!msgText.trim() || !selectedId || sending) return;
    setSending(true);
    const text = msgText.trim();
    setMsgText("");
    try {
      const msg = await messagesApi.send(selectedId, { text });
      setMessages((prev) => [...prev, msg]);
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === selectedId);
        if (!existing) return prev;
        return [
          { ...existing, lastMessage: msg, lastActivity: msg.createdAt },
          ...prev.filter((c) => c.id !== selectedId),
        ];
      });
    } catch {
      toast.error(t("chats.failedToSend"));
      setMsgText(text);
    }
    setSending(false);
  };

  const handleSendFile = async (file: File) => {
    if (!selectedId) return;
    try {
      const msg = await messagesApi.sendMedia(selectedId, file, "document");
      setMessages((prev) => [...prev, msg]);
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === selectedId);
        if (!existing) return prev;
        return [
          { ...existing, lastMessage: msg, lastActivity: msg.createdAt },
          ...prev.filter((c) => c.id !== selectedId),
        ];
      });
    } catch {
      toast.error(t("chats.failedToSendFile"));
    }
  };

  const selectedConv = conversations.find((c) => c.id === selectedId);

  const groupedMessages = () => {
    const groups: { date: string; msgs: any[] }[] = [];
    messages.forEach((msg) => {
      const day = msg.createdAt.slice(0, 10);
      const last = groups[groups.length - 1];
      if (last && last.date === day) last.msgs.push(msg);
      else groups.push({ date: day, msgs: [msg] });
    });
    return groups;
  };

  const filteredConvs = conversations.filter(
    (c) =>
      (!search ||
        candidateName(c, t).toLowerCase().includes(search.toLowerCase()) ||
        (c.username && c.username.toLowerCase().includes(search.toLowerCase()))) &&
      (!selectedBotId || c.botId === selectedBotId),
  );

  // On mobile, show conversation list when nothing is selected, show chat when selected
  const showConvList = !selectedId;

  return (
    <>
      <div className="flex h-full overflow-hidden">
        {/* ── LEFT: Conversation list ──────────────────────────────────────── */}
        <div
          className={`${
            selectedId ? "hidden sm:flex" : "flex"
          } w-full sm:w-80 flex-shrink-0 border-r border-gray-200 bg-white flex-col`}
        >
          <div className="px-4 pt-4 sm:pt-5 pb-3 border-b border-gray-100">
            <h1 className="text-lg font-bold text-gray-900 mb-3">{t("chats.title")}</h1>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                🔍
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("pipeline.searchConversations")}
                className="w-full pl-8 pr-3 py-2 text-sm bg-gray-100 rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-blue-300 placeholder-gray-400"
              />
            </div>
            {/* Bot filter for admins */}
            {!isOrg() && bots.length > 1 && (
              <select
                value={selectedBotId}
                onChange={(e) => setSelectedBotId(e.target.value)}
                className="mt-2 w-full text-xs bg-gray-100 rounded-xl px-3 py-2 border-0 focus:outline-none focus:ring-2 focus:ring-blue-300 text-gray-600"
              >
                <option value="">{t("pipeline.filterAllBots")}</option>
                {bots.map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.name} {b.username ? `(@${b.username})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingConvs ? (
              <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
                {t("common.loading")}
              </div>
            ) : filteredConvs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <p className="text-3xl mb-2">💬</p>
                <p className="text-sm font-medium">
                  {search ? t("chats.noResults") : t("chats.noConversations")}
                </p>
                <p className="text-xs mt-1 text-gray-300">
                  {search
                    ? t("chats.tryDifferentName")
                    : t("chats.messagesFromBot")}
                </p>
              </div>
            ) : (
              filteredConvs.map((conv) => {
                const isSelected = conv.id === selectedId;
                const hasUnread = conv.unreadCount > 0;
                return (
                  <button
                    key={conv.id}
                    onClick={() => {
                      setSelectedId(conv.id);
                      setShowInfo(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-gray-50 border-b border-gray-50
                      ${isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
                  >
                    <div className="relative flex-shrink-0">
                      <Avatar conv={conv} />
                      {hasUnread && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                          {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-1">
                        <p
                          className={`text-sm truncate ${hasUnread ? "font-bold text-gray-900" : "font-medium text-gray-800"}`}
                        >
                          {candidateName(conv, t)}
                        </p>
                        {conv.lastActivity && (
                          <span
                            className={`text-[11px] flex-shrink-0 ${hasUnread ? "text-blue-500 font-semibold" : "text-gray-400"}`}
                          >
                            {(() => {
                              return formatConvTime(conv.lastActivity, t);
                            })()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <p
                          className={`text-xs truncate ${hasUnread ? "text-gray-700 font-medium" : "text-gray-400"}`}
                        >
                          {conv.lastMessage?.direction === "outbound" && (
                            <span className="text-gray-400">{t("common.you")}: </span>
                          )}
                          {lastMsgPreview(conv.lastMessage, t)}
                        </p>
                        {conv.botName && (
                          <span className="text-[10px] text-gray-300 flex-shrink-0 bg-gray-100 px-1.5 py-0.5 rounded-full truncate max-w-[60px]">
                            {conv.botName}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── CENTER: Chat ─────────────────────────────────────────────────── */}
        <div
          className={`${
            !selectedId ? "hidden sm:flex" : "flex"
          } flex-1 flex-col bg-gray-50 min-w-0 overflow-hidden`}
        >
          {!selectedId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 select-none">
              <div className="w-24 h-24 rounded-3xl bg-white border-2 border-gray-100 flex items-center justify-center text-4xl mb-5 shadow-sm">
                💬
              </div>
              <p className="text-xl font-semibold text-gray-600">
                {t("chats.selectConversation")}
              </p>
              <p className="text-sm mt-2 text-gray-400">
                {t("chats.chooseFromList")}
              </p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 py-3 sm:py-3.5 bg-white border-b border-gray-200 flex-shrink-0 shadow-sm">
                {/* Back button on mobile */}
                <button
                  onClick={() => setSelectedId(null)}
                  className="sm:hidden w-8 h-8 flex items-center justify-center text-gray-500 hover:text-gray-700 flex-shrink-0"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                {selectedConv && <Avatar conv={selectedConv} size="md" />}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 truncate text-sm sm:text-base">
                    {selectedConv ? candidateName(selectedConv, t) : "…"}
                  </p>
                  {selectedConv?.username && (
                    <p className="text-xs text-gray-400">
                      @{selectedConv.username}
                    </p>
                  )}
                </div>
                {selectedConv?.botName && (
                  <span className="hidden sm:inline-flex text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full flex-shrink-0">
                    🤖 {selectedConv.botName}
                  </span>
                )}
                {/* Info toggle button */}
                <button
                  onClick={() => setShowInfo((v) => !v)}
                  title={t("chats.candidateInfo")}
                  className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors flex-shrink-0 ${
                    showInfo
                      ? "bg-blue-100 text-blue-600"
                      : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  }`}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4">
                {loadingMsgs ? (
                  <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                    {t("common.loading")}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <p className="text-3xl mb-2">👋</p>
                    <p className="text-sm font-medium">{t("chats.noMessages")}</p>
                    <p className="text-xs mt-1">{t("chats.startConversation")}</p>
                  </div>
                ) : (
                  <div className="space-y-0.5 max-w-3xl mx-auto">
                    {groupedMessages().map((group) => (
                      <React.Fragment key={group.date}>
                        <DaySeparator date={group.date} />
                        {group.msgs.map((msg) => (
                          <MessageBubble
                            key={msg.id}
                            msg={msg}
                            onImageClick={setLightboxSrc}
                          />
                        ))}
                      </React.Fragment>
                    ))}
                    <div ref={chatBottomRef} />
                  </div>
                )}
              </div>

              {/* Input bar */}
              <div className="flex-shrink-0 bg-white border-t border-gray-200 px-3 sm:px-6 py-3 sm:py-4">
                <div className="flex items-end gap-2 sm:gap-3 max-w-3xl mx-auto">
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleSendFile(f);
                      e.target.value = "";
                    }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors flex-shrink-0 mb-0.5"
                    title={t("candidates.panel.attachFile")}
                  >
                    📎
                  </button>
                  <div className="flex-1 relative">
                    <input
                      ref={inputRef}
                      value={msgText}
                      onChange={(e) => setMsgText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder={t("chats.writeMessage")}
                      className="w-full text-sm bg-gray-100 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:bg-white transition-colors placeholder-gray-400"
                    />
                  </div>
                  <button
                    onClick={handleSendMessage}
                    disabled={sending || !msgText.trim()}
                    className="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors flex-shrink-0 mb-0.5"
                    title={t("common.send")}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4"
                    >
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: Candidate info panel ───────────────────────────────────── */}
        {/* Inline panel (not fixed overlay) when in chat context */}
        {showInfo && selectedId && (
          <div className="fixed inset-0 sm:static sm:inset-auto w-full sm:w-[380px] flex-shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-y-auto z-30">
            <CandidateDetailPanel
              candidateId={selectedId}
              inline={true}
              onClose={() => setShowInfo(false)}
              onStatusChange={() => {
                // Refresh conv list to reflect any status changes
                loadConversations();
              }}
            />
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt=""
            className="max-w-[90vw] max-h-[90vh] rounded-2xl object-contain shadow-2xl"
          />
          <button
            className="absolute top-4 right-4 text-white text-3xl leading-none opacity-70 hover:opacity-100"
            onClick={() => setLightboxSrc(null)}
          >
            ×
          </button>
        </div>
      )}
    </>
  );
};
