import React, { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { candidatesApi, messagesApi, botsApi, jobsApi, filesApi } from "../api";
import { useWebSocket } from "../hooks/useWebSocket";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/auth";

// ─── Column definitions ───────────────────────────────────────────────────────

interface Column {
  id: string;
  label: string;
  color: string;
  dot: string;
}

const COLUMNS: Column[] = [
  { id: "applied", label: "New", color: "bg-blue-50", dot: "bg-blue-500" },
  {
    id: "screening",
    label: "Screening",
    color: "bg-yellow-50",
    dot: "bg-yellow-500",
  },
  {
    id: "interviewing",
    label: "Interview",
    color: "bg-purple-50",
    dot: "bg-purple-500",
  },
  {
    id: "offered",
    label: "Offer",
    color: "bg-orange-50",
    dot: "bg-orange-500",
  },
  { id: "hired", label: "Hired", color: "bg-green-50", dot: "bg-green-500" },
  { id: "rejected", label: "Rejected", color: "bg-red-50", dot: "bg-red-400" },
];

const STATUSES_ALL = [
  "incomplete",
  "applied",
  "screening",
  "interviewing",
  "offered",
  "hired",
  "rejected",
  "archived",
];

// ─── Candidate card ───────────────────────────────────────────────────────────

const CandidateCard: React.FC<{
  candidate: any;
  onClick: () => void;
}> = ({ candidate, onClick }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: candidate.id,
    });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 }
    : undefined;

  const initials = (
    (candidate.fullName || candidate.username || "?")[0] || "?"
  ).toUpperCase();
  const jobTitle = candidate.job?.translations?.[0]?.title || "";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-xl border border-gray-200 p-3.5 select-none
        hover:shadow-md hover:border-gray-300 transition-all duration-150
        ${isDragging ? "opacity-30" : "opacity-100"}`}
    >
      <div className="flex items-center gap-3">
        {/* Drag handle */}
        <div
          {...listeners}
          {...attributes}
          className="cursor-grab active:cursor-grabbing text-gray-200 hover:text-gray-400 transition-colors flex-shrink-0"
          title="Drag to change status"
        >
          ⠿
        </div>

        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
          {initials}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onClick}>
          <p className="font-semibold text-gray-800 text-sm truncate leading-tight">
            {candidate.fullName || candidate.username || "Unknown"}
          </p>
          {jobTitle && (
            <p className="text-xs text-gray-400 truncate mt-0.5">{jobTitle}</p>
          )}
        </div>

        {/* Unread badge */}
        {candidate.unreadCount > 0 && (
          <div className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 flex items-center justify-center shadow-sm animate-pulse">
            <span className="text-white text-xs font-bold leading-none">
              {candidate.unreadCount > 99 ? "99+" : candidate.unreadCount}
            </span>
          </div>
        )}
      </div>

      {candidate.lastActivity && (
        <p className="text-xs text-gray-300 mt-2 pl-12">
          {format(new Date(candidate.lastActivity), "MMM d")}
        </p>
      )}
    </div>
  );
};

// ─── Droppable column ─────────────────────────────────────────────────────────

const KanbanColumn: React.FC<{
  column: Column;
  candidates: any[];
  onCardClick: (c: any) => void;
}> = ({ column, candidates, onCardClick }) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className={`w-2 h-2 rounded-full ${column.dot}`} />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {column.label}
        </span>
        <span className="ml-auto text-xs font-bold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
          {candidates.length}
        </span>
      </div>

      {/* Cards area */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[100px] rounded-xl p-2 space-y-2 transition-colors duration-150
          ${isOver ? "bg-blue-100 ring-2 ring-blue-300" : column.color}`}
      >
        {candidates.map((c) => (
          <CandidateCard
            key={c.id}
            candidate={c}
            onClick={() => onCardClick(c)}
          />
        ))}
        {candidates.length === 0 && (
          <div
            className={`text-center text-xs py-6 pointer-events-none transition-colors ${
              isOver ? "text-blue-400 font-medium" : "text-gray-300"
            }`}
          >
            {isOver ? "✓ Drop here" : "Drop here"}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Detail Panel ─────────────────────────────────────────────────────────────

const DetailPanel: React.FC<{
  candidateId: string | null;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
}> = ({ candidateId, onClose, onStatusChange }) => {
  const { admin } = useAuthStore();
  const [candidate, setCandidate] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [tab, setTab] = useState<"answers" | "chat" | "files">("answers");
  const [comment, setComment] = useState("");
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!candidateId) {
      setCandidate(null);
      return;
    }
    setLoading(true);
    setTab("answers");
    Promise.all([candidatesApi.get(candidateId), messagesApi.list(candidateId)])
      .then(([c, m]) => {
        setCandidate(c);
        setMessages(m);
      })
      .finally(() => setLoading(false));
  }, [candidateId]);

  useEffect(() => {
    if (tab === "chat") {
      setTimeout(
        () => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }),
        100,
      );
    }
  }, [messages, tab]);

  useWebSocket({
    NEW_MESSAGE: (payload) => {
      if (payload?.candidateId !== candidateId) return;
      // Only add INBOUND messages via WebSocket.
      // Outbound messages are added directly from the API response in
      // handleSendMessage/handleSendFile, so adding them here too would
      // duplicate them (race condition between setState calls).
      if (payload?.message?.direction !== "inbound") return;
      setMessages((prev) =>
        prev.find((m) => m.id === payload.message?.id)
          ? prev
          : [...prev, payload.message],
      );
    },
  });

  const handleStatusChange = async (status: string) => {
    if (!candidate) return;
    try {
      await candidatesApi.update(candidate.id, { status });
      setCandidate((c: any) => ({ ...c, status }));
      onStatusChange(candidate.id, status);
      toast.success(`Moved to ${status}`);
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleSendMessage = async () => {
    if (!msgText.trim() || !candidateId) return;
    setSending(true);
    try {
      const msg = await messagesApi.send(candidateId, {
        text: msgText,
        type: "text",
      });
      setMessages((prev) => [...prev, msg]);
      setMsgText("");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handleSendFile = async (file: File) => {
    if (!candidateId) return;
    setSending(true);
    try {
      const msg = await messagesApi.sendMedia(candidateId, file, "document");
      setMessages((prev) => [...prev, msg]);
    } catch {
      toast.error("Failed to send file");
    } finally {
      setSending(false);
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim() || !candidateId) return;
    try {
      const c = await candidatesApi.addComment(candidateId, comment);
      setCandidate((prev: any) => ({
        ...prev,
        comments: [...(prev.comments || []), c],
      }));
      setComment("");
    } catch {
      toast.error("Failed to add note");
    }
  };

  const handleQuickAction = async (status: "hired" | "rejected") => {
    if (!candidate || !confirm(`Mark as ${status}?`)) return;
    await handleStatusChange(status);
  };

  if (!candidateId) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-30" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[420px] bg-white shadow-2xl z-40 flex flex-col">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 z-10 transition-colors"
        >
          ✕
        </button>

        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            Loading…
          </div>
        ) : !candidate ? null : (
          <>
            {/* Header */}
            <div className="p-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-4 pr-8">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                  {(
                    (candidate.fullName || candidate.username || "?")[0] || "?"
                  ).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 leading-tight">
                    {candidate.fullName || candidate.username || "Unknown"}
                  </h2>
                  <p className="text-sm text-blue-500 font-medium mt-0.5">
                    {candidate.job?.translations?.[0]?.title || ""}
                  </p>
                </div>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              {/* Status + Contact */}
              <div className="grid grid-cols-2 gap-4 p-5 pb-0">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    Status
                  </p>
                  <select
                    value={candidate.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className="w-full text-sm font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300"
                  >
                    {STATUSES_ALL.map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    Contact
                  </p>
                  <p className="text-sm font-semibold text-gray-700">
                    {candidate.phone ||
                      candidate.email ||
                      (candidate.username ? `@${candidate.username}` : "—")}
                  </p>
                  {candidate.phone && candidate.email && (
                    <p className="text-xs text-gray-400">{candidate.email}</p>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex mx-5 mt-4 border-b border-gray-100">
                {(["answers", "chat", "files"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-2 text-xs font-semibold capitalize border-b-2 -mb-px transition-colors ${
                      tab === t
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-400 hover:text-gray-600"
                    }`}
                  >
                    {t}
                    {t === "chat" && messages.length > 0 && (
                      <span className="ml-1 bg-blue-100 text-blue-600 rounded-full px-1.5 text-xs">
                        {messages.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* ── Answers tab ── */}
              {tab === "answers" && (
                <div className="p-5 space-y-4">
                  {/* Survey answers */}
                  {candidate.answers?.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                        🤖 Bot Answers
                      </p>
                      {candidate.answers.map((answer: any) => {
                        const q =
                          answer.question?.translations?.[0]?.text ||
                          "Question";
                        const a =
                          answer.option?.translations?.[0]?.text ||
                          answer.textValue ||
                          "—";
                        return (
                          <div key={answer.id}>
                            <p className="text-xs text-gray-400 mb-0.5">{q}</p>
                            <p className="text-sm font-semibold text-gray-800">
                              {a}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Notes / comments */}
                  <div
                    className={
                      candidate.answers?.length > 0
                        ? "border-t border-gray-100 pt-4"
                        : ""
                    }
                  >
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      ✏️ Notes
                    </p>
                    {candidate.comments?.length === 0 && (
                      <p className="text-xs text-gray-300 mb-2">No notes yet</p>
                    )}
                    {candidate.comments?.map((c: any) => (
                      <div
                        key={c.id}
                        className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-2"
                      >
                        <p className="text-sm text-gray-700">{c.text}</p>
                        <p className="text-xs text-amber-400 mt-1">
                          {c.admin?.name} ·{" "}
                          {format(new Date(c.createdAt), "MMM d")}
                        </p>
                      </div>
                    ))}
                    <div className="flex gap-2 mt-2">
                      <input
                        type="text"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleAddComment()
                        }
                        placeholder="Add a note…"
                        className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300"
                      />
                      <button
                        onClick={handleAddComment}
                        disabled={!comment.trim()}
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-sm disabled:opacity-40 transition-colors"
                      >
                        ➕
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Chat tab ── */}
              {tab === "chat" && (
                <div className="flex flex-col" style={{ height: 360 }}>
                  {candidate.status === "incomplete" && (
                    <div className="mx-4 mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-600">
                      Messaging available once candidate submits (Applied+)
                    </div>
                  )}
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {messages.length === 0 ? (
                      <p className="text-center text-gray-300 text-sm py-6">
                        No messages yet
                      </p>
                    ) : (
                      messages.map((msg) => {
                        const isOut = msg.direction === "outbound";
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isOut ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                                isOut
                                  ? "bg-blue-600 text-white rounded-br-none"
                                  : "bg-gray-100 text-gray-800 rounded-bl-none"
                              }`}
                            >
                              {msg.type === "text" && <p>{msg.text}</p>}
                              {msg.type === "photo" && msg.localPath && (
                                <img
                                  src={filesApi.serveUrl(msg.id)}
                                  alt="photo"
                                  className="max-w-full rounded max-h-40 object-cover"
                                />
                              )}
                              {msg.type === "document" && (
                                <a
                                  href={filesApi.serveUrl(msg.id)}
                                  download
                                  className={`flex items-center gap-1 ${isOut ? "text-blue-100" : "text-blue-600"}`}
                                >
                                  📎 {msg.fileName || "File"}
                                </a>
                              )}
                              {msg.type === "voice" && (
                                <audio
                                  controls
                                  src={filesApi.serveUrl(msg.id)}
                                  className="max-w-full h-8"
                                />
                              )}
                              <p
                                className={`text-xs mt-1 ${isOut ? "text-blue-200" : "text-gray-400"}`}
                              >
                                {format(new Date(msg.createdAt), "HH:mm")}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={chatBottomRef} />
                  </div>
                  {candidate.status !== "incomplete" && (
                    <div className="p-3 border-t border-gray-100 flex gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleSendFile(f);
                          e.target.value = "";
                        }}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                      >
                        📎
                      </button>
                      <input
                        type="text"
                        value={msgText}
                        onChange={(e) => setMsgText(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleSendMessage()
                        }
                        placeholder="Message…"
                        className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300"
                        disabled={sending}
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={!msgText.trim() || sending}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm disabled:opacity-40 transition-colors"
                      >
                        {sending ? "…" : "→"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Files tab ── */}
              {tab === "files" && (
                <div className="p-5 space-y-2">
                  {!candidate.files || candidate.files.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      No files uploaded
                    </p>
                  ) : (
                    candidate.files.map((f: any) => (
                      <a
                        key={f.id}
                        href={filesApi.downloadUrl(f.id)}
                        download={f.fileName}
                        className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-xl">📄</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700 truncate">
                            {f.fileName}
                          </p>
                          <p className="text-xs text-gray-400">
                            {format(new Date(f.createdAt), "MMM d, yyyy")}
                          </p>
                        </div>
                        <span className="text-xs text-blue-500 font-bold">
                          ↓
                        </span>
                      </a>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Footer quick actions */}
            {!["hired", "rejected", "archived"].includes(candidate.status) && (
              <div className="p-4 border-t border-gray-100 space-y-2 flex-shrink-0">
                <button
                  onClick={() => handleQuickAction("hired")}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-colors text-sm"
                >
                  👤 Mark as Hired
                </button>
                <button
                  onClick={() => handleQuickAction("rejected")}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border border-red-300 text-red-500 hover:bg-red-50 font-semibold rounded-xl transition-colors text-sm"
                >
                  🚫 Reject
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

export const CandidatesPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const botIdFilter = searchParams.get("botId") || "";

  const [allCandidates, setAllCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [bots, setBots] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    botId: botIdFilter,
    jobId: "",
    search: "",
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const result = await candidatesApi.list({
        botId: filters.botId || undefined,
        jobId: filters.jobId || undefined,
        search: filters.search || undefined,
        limit: 300,
        page: 1,
      });
      setAllCandidates(result.candidates || []);
    } catch {}
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  useEffect(() => {
    Promise.all([botsApi.list(), jobsApi.list()]).then(([b, j]) => {
      setBots(b);
      setJobs(j);
    });
  }, []);

  useWebSocket({
    NEW_APPLICATION: () => fetchCandidates(),
    STATUS_CHANGE: () => fetchCandidates(),
    CANDIDATE_UPDATE: () => fetchCandidates(),
    // Increment unread badge when a new inbound message arrives —
    // no full re-fetch needed, just mutate the count in-place.
    NEW_MESSAGE: (payload) => {
      if (payload?.message?.direction !== "inbound") return;
      const { candidateId, unreadCount } = payload;
      if (!candidateId) return;
      setAllCandidates((prev) =>
        prev.map((c) =>
          c.id === candidateId
            ? { ...c, unreadCount: unreadCount ?? (c.unreadCount || 0) + 1 }
            : c,
        ),
      );
    },
    // Clear badge when any admin marks messages as read (including other tabs).
    MESSAGES_READ: (payload) => {
      const { candidateId } = payload || {};
      if (!candidateId) return;
      setAllCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? { ...c, unreadCount: 0 } : c)),
      );
    },
  });

  const activeCandidate = activeId
    ? allCandidates.find((c) => c.id === activeId)
    : null;

  const handleDragStart = (e: DragStartEvent) =>
    setActiveId(e.active.id as string);

  // Called when a candidate card is clicked — open panel and mark messages read
  const handleCardClick = useCallback(async (candidateId: string) => {
    setSelectedCandidateId(candidateId);
    // Optimistically clear the badge immediately so the admin sees feedback
    setAllCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, unreadCount: 0 } : c)),
    );
    // Fire-and-forget: mark all inbound messages as read on the server
    // The WS MESSAGES_READ broadcast will keep other open tabs in sync
    messagesApi.markAsRead(candidateId).catch(() => {});
  }, []);

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;

    const newStatus = over.id as string;
    const candidateId = active.id as string;
    if (!COLUMNS.find((c) => c.id === newStatus)) return;

    const candidate = allCandidates.find((c) => c.id === candidateId);
    if (!candidate || candidate.status === newStatus) return;

    // Optimistic update
    setAllCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, status: newStatus } : c)),
    );

    try {
      await candidatesApi.update(candidateId, { status: newStatus });
      toast.success(`Moved to ${newStatus}`);
    } catch {
      toast.error("Failed to update status");
      fetchCandidates();
    }
  };

  const handleStatusChangeFromPanel = (id: string, status: string) => {
    setAllCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status } : c)),
    );
  };

  const filteredJobs = filters.botId
    ? jobs.filter((j) => j.botId === filters.botId)
    : jobs;

  const incompleteCount = allCandidates.filter(
    (c) => c.status === "incomplete",
  ).length;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Candidates</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {allCandidates.length} total
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search name, phone…"
            value={filters.search}
            onChange={(e) =>
              setFilters((f) => ({ ...f, search: e.target.value }))
            }
            className="w-44 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
          />
          <select
            value={filters.botId}
            onChange={(e) =>
              setFilters((f) => ({ ...f, botId: e.target.value, jobId: "" }))
            }
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
          >
            <option value="">All bots</option>
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            value={filters.jobId}
            onChange={(e) =>
              setFilters((f) => ({ ...f, jobId: e.target.value }))
            }
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
          >
            <option value="">All jobs</option>
            {filteredJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.translations?.[0]?.title || "Untitled"}
              </option>
            ))}
          </select>
          <div className="flex rounded-xl border border-gray-200 overflow-hidden">
            <button
              onClick={() => setViewMode("kanban")}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === "kanban"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              ⬜ Board
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === "list"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              ☰ List
            </button>
          </div>
        </div>
      </div>

      {/* Incomplete banner */}
      {incompleteCount > 0 && (
        <div className="mx-6 mt-3 flex-shrink-0 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-sm text-amber-700">
          ⏳ <strong>{incompleteCount}</strong> incomplete application
          {incompleteCount > 1 ? "s" : ""} — not shown on board
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Loading…
        </div>
      ) : viewMode === "kanban" ? (
        /* ── KANBAN ── */
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div
              className="flex gap-5 p-6 h-full"
              style={{ minWidth: "max-content" }}
            >
              {COLUMNS.map((col) => (
                <KanbanColumn
                  key={col.id}
                  column={col}
                  candidates={allCandidates.filter((c) => c.status === col.id)}
                  onCardClick={(c) => handleCardClick(c.id)}
                />
              ))}
            </div>
          </div>

          <DragOverlay dropAnimation={null}>
            {activeCandidate ? (
              <div className="w-72 bg-white rounded-xl border-2 border-blue-400 shadow-2xl p-3.5 rotate-2 opacity-95 pointer-events-none">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-sm font-bold">
                    {(
                      (activeCandidate.fullName ||
                        activeCandidate.username ||
                        "?")[0] || "?"
                    ).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">
                      {activeCandidate.fullName ||
                        activeCandidate.username ||
                        "Unknown"}
                    </p>
                    <p className="text-xs text-gray-400">
                      {activeCandidate.job?.translations?.[0]?.title || ""}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        /* ── LIST VIEW ── */
        <div className="flex-1 overflow-y-auto p-6">
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">
                    Candidate
                  </th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">
                    Job
                  </th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">
                    Last Activity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {allCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-gray-400">
                      No candidates found
                    </td>
                  </tr>
                ) : (
                  allCandidates.map((c) => {
                    const col = COLUMNS.find((col) => col.id === c.status);
                    return (
                      <tr
                        key={c.id}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => handleCardClick(c.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                              {(
                                (c.fullName || c.username || "?")[0] || "?"
                              ).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                {c.fullName || c.username || "Unknown"}
                              </p>
                              {c.username && (
                                <p className="text-xs text-gray-400">
                                  @{c.username}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {c.job?.translations?.[0]?.title || "N/A"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                              col
                                ? `${col.color} text-gray-700`
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${col?.dot || "bg-gray-400"}`}
                            />
                            {c.status.charAt(0).toUpperCase() +
                              c.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {format(new Date(c.lastActivity), "MMM d, HH:mm")}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Slide-in detail panel */}
      <DetailPanel
        candidateId={selectedCandidateId}
        onClose={() => setSelectedCandidateId(null)}
        onStatusChange={handleStatusChangeFromPanel}
      />
    </div>
  );
};
