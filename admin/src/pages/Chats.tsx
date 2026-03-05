import React, { useEffect, useRef, useState, useCallback } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { messagesApi, filesApi } from "../api";
import { useWebSocket } from "../hooks/useWebSocket";
import toast from "react-hot-toast";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatConvTime(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

function formatMsgTime(dateStr: string) {
  return format(new Date(dateStr), "HH:mm");
}

function candidateName(c: any) {
  return c.fullName || (c.username ? `@${c.username}` : "Unknown");
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

function isViewableInBrowser(mimeType?: string | null): boolean {
  if (!mimeType) return false;
  return (
    mimeType.startsWith("image/") ||
    mimeType.startsWith("video/") ||
    mimeType.startsWith("audio/") ||
    mimeType.startsWith("text/") ||
    mimeType === "application/pdf"
  );
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
  const idx = id.charCodeAt(0) % gradients.length;
  return gradients[idx];
}

function lastMsgPreview(msg: any) {
  if (!msg) return "No messages yet";
  if (msg.type === "text") return msg.text || "…";
  if (msg.type === "photo") return "📷 Photo";
  if (msg.type === "document") return `📎 ${msg.fileName || "File"}`;
  if (msg.type === "voice") return "🎤 Voice message";
  if (msg.type === "video") return "🎥 Video";
  if (msg.type === "audio") return "🎵 Audio";
  return "📎 Attachment";
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
          className="max-w-[260px] max-h-[320px] rounded-xl object-cover cursor-zoom-in"
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
            className="h-8 w-48"
          />
        </div>
      );
    if (msg.type === "video")
      return (
        <video
          controls
          src={filesApi.serveUrl(msg.id)}
          className="max-w-[260px] max-h-[200px] rounded-xl"
        />
      );
    if (msg.type === "audio")
      return (
        <div className="flex items-center gap-2">
          <span className="text-base">🎵</span>
          <audio
            controls
            src={filesApi.serveUrl(msg.id)}
            className="h-8 w-48"
          />
        </div>
      );
    // document / unknown
    const viewable = isViewableInBrowser(msg.mimeType);
    return (
      <a
        href={filesApi.serveUrl(msg.id)}
        target="_blank"
        rel="noopener noreferrer"
        {...(!viewable ? { download: msg.fileName } : {})}
        className={`flex items-center gap-2.5 hover:opacity-80 transition-opacity ${isOut ? "text-blue-100" : "text-blue-600"}`}
      >
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isOut ? "bg-blue-500" : "bg-blue-100"}`}
        >
          <span className="text-sm">
            {msg.mimeType === "application/pdf" ? "📄" : "📎"}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate max-w-[180px]">
            {msg.fileName || "File"}
          </p>
          <p className={`text-xs ${isOut ? "text-blue-200" : "text-gray-400"}`}>
            {viewable ? "Open" : "Download"}
          </p>
        </div>
      </a>
    );
  };

  return (
    <div
      className={`flex items-end gap-2 group ${isOut ? "flex-row-reverse" : "flex-row"}`}
    >
      <div
        className={`max-w-[72%] rounded-2xl px-3.5 py-2.5 shadow-sm
        ${
          isOut
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-white text-gray-800 rounded-bl-sm border border-gray-100"
        }`}
      >
        {content()}
        <div
          className={`flex items-center gap-1 mt-1 ${isOut ? "justify-end" : "justify-start"}`}
        >
          <span
            className={`text-[10px] ${isOut ? "text-blue-200" : "text-gray-400"}`}
          >
            {formatMsgTime(msg.createdAt)}
          </span>
          {isOut && (
            <span className="text-[10px] text-blue-200">
              {msg.telegramMsgId ? "✓✓" : "✓"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Day Separator ────────────────────────────────────────────────────────────

const DaySeparator: React.FC<{ date: string }> = ({ date }) => {
  const d = new Date(date);
  const label = isToday(d)
    ? "Today"
    : isYesterday(d)
      ? "Yesterday"
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
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load conversation list
  const loadConversations = useCallback(() => {
    messagesApi
      .conversations()
      .then(setConversations)
      .finally(() => setLoadingConvs(false));
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load messages when conversation selected
  useEffect(() => {
    if (!selectedId) return;
    setLoadingMsgs(true);
    messagesApi
      .list(selectedId)
      .then(setMessages)
      .finally(() => setLoadingMsgs(false));
    messagesApi.markAsRead(selectedId).catch(() => {});
    // Clear unread badge
    setConversations((prev) =>
      prev.map((c) => (c.id === selectedId ? { ...c, unreadCount: 0 } : c)),
    );
  }, [selectedId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when conversation selected
  useEffect(() => {
    if (selectedId) setTimeout(() => inputRef.current?.focus(), 100);
  }, [selectedId]);

  // WebSocket
  useWebSocket({
    NEW_MESSAGE: (payload) => {
      const { candidateId, message } = payload;

      // Update conversation list: bump to top, update last message & unread
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === candidateId);
        if (!existing) {
          // New conversation — reload the full list
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

      // Add to open chat (inbound only — outbound added optimistically)
      if (candidateId === selectedId && message.direction === "inbound") {
        setMessages((prev) =>
          prev.some((m) => m.id === message.id) ? prev : [...prev, message],
        );
        messagesApi.markAsRead(candidateId).catch(() => {});
      }
    },
    MESSAGES_READ: (payload) => {
      if (payload?.candidateId) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === payload.candidateId ? { ...c, unreadCount: 0 } : c,
          ),
        );
      }
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
      // Update conversation last message
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === selectedId);
        if (!existing) return prev;
        return [
          { ...existing, lastMessage: msg, lastActivity: msg.createdAt },
          ...prev.filter((c) => c.id !== selectedId),
        ];
      });
    } catch {
      toast.error("Failed to send");
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
      toast.error("Failed to send file");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const selectedConv = conversations.find((c) => c.id === selectedId);

  // Group messages by day
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
      !search ||
      candidateName(c).toLowerCase().includes(search.toLowerCase()) ||
      (c.username && c.username.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <>
      <div className="flex h-full overflow-hidden" style={{ marginLeft: 0 }}>
        {/* ── LEFT PANEL: Conversation list ─────────────────────────────────── */}
        <div className="w-80 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
          {/* Header */}
          <div className="px-4 pt-5 pb-3 border-b border-gray-100">
            <h1 className="text-lg font-bold text-gray-900 mb-3">Chats</h1>
            {/* Search */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                🔍
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations…"
                className="w-full pl-8 pr-3 py-2 text-sm bg-gray-100 rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-blue-300 placeholder-gray-400"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loadingConvs ? (
              <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
                Loading…
              </div>
            ) : filteredConvs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <p className="text-3xl mb-2">💬</p>
                <p className="text-sm font-medium">
                  {search ? "No results" : "No conversations yet"}
                </p>
                <p className="text-xs mt-1 text-gray-300">
                  {search
                    ? "Try a different name"
                    : "Messages from bot users will appear here"}
                </p>
              </div>
            ) : (
              filteredConvs.map((conv) => {
                const isSelected = conv.id === selectedId;
                const hasUnread = conv.unreadCount > 0;
                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedId(conv.id)}
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
                          {candidateName(conv)}
                        </p>
                        {conv.lastActivity && (
                          <span
                            className={`text-[11px] flex-shrink-0 ${hasUnread ? "text-blue-500 font-semibold" : "text-gray-400"}`}
                          >
                            {formatConvTime(conv.lastActivity)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <p
                          className={`text-xs truncate ${hasUnread ? "text-gray-700 font-medium" : "text-gray-400"}`}
                        >
                          {conv.lastMessage?.direction === "outbound" && (
                            <span className="text-gray-400">You: </span>
                          )}
                          {lastMsgPreview(conv.lastMessage)}
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

        {/* ── RIGHT PANEL: Chat ──────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col bg-gray-50 min-w-0">
          {!selectedId ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 select-none">
              <div className="w-24 h-24 rounded-3xl bg-white border-2 border-gray-100 flex items-center justify-center text-4xl mb-5 shadow-sm">
                💬
              </div>
              <p className="text-xl font-semibold text-gray-600">
                Select a conversation
              </p>
              <p className="text-sm mt-2 text-gray-400">
                Choose from the list on the left
              </p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-gray-200 flex-shrink-0 shadow-sm">
                {selectedConv && (
                  <div
                    className={
                      selectedConv.profilePhoto ? "cursor-zoom-in" : ""
                    }
                    onClick={() => {
                      if (selectedConv.profilePhoto)
                        setLightboxSrc(
                          `/uploads/${selectedConv.botId}/${selectedConv.profilePhoto.split(/[\/\\]/).pop()}`,
                        );
                    }}
                  >
                    <Avatar conv={selectedConv} size="md" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 truncate">
                    {selectedConv ? candidateName(selectedConv) : "…"}
                  </p>
                  {selectedConv?.username && (
                    <p className="text-xs text-gray-400">
                      @{selectedConv.username}
                    </p>
                  )}
                </div>
                {selectedConv?.botName && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full flex-shrink-0">
                    🤖 {selectedConv.botName}
                  </span>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {loadingMsgs ? (
                  <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                    Loading…
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <p className="text-3xl mb-2">👋</p>
                    <p className="text-sm font-medium">No messages yet</p>
                    <p className="text-xs mt-1">Start the conversation below</p>
                  </div>
                ) : (
                  <div className="space-y-1 max-w-3xl mx-auto">
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
              <div className="flex-shrink-0 bg-white border-t border-gray-200 px-6 py-4">
                <div className="flex items-end gap-3 max-w-3xl mx-auto">
                  {/* Attach */}
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
                    title="Attach file"
                  >
                    📎
                  </button>

                  {/* Text input */}
                  <div className="flex-1 relative">
                    <input
                      ref={inputRef}
                      value={msgText}
                      onChange={(e) => setMsgText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Write a message…"
                      className="w-full text-sm bg-gray-100 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:bg-white transition-colors placeholder-gray-400"
                    />
                  </div>

                  {/* Send */}
                  <button
                    onClick={handleSendMessage}
                    disabled={sending || !msgText.trim()}
                    className="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors flex-shrink-0 mb-0.5"
                    title="Send"
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
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center"
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
