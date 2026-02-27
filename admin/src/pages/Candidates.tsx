import React, { useEffect, useState, useCallback, useRef } from "react";
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
import {
  candidatesApi,
  messagesApi,
  botsApi,
  jobsApi,
  filesApi,
  columnsApi,
} from "../api";
import { useWebSocket } from "../hooks/useWebSocket";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/auth";

// ─── Color presets ────────────────────────────────────────────────────────────

const COLOR_PRESETS = [
  { color: "bg-slate-50", dot: "bg-slate-400", label: "Gray" },
  { color: "bg-blue-50", dot: "bg-blue-500", label: "Blue" },
  { color: "bg-violet-50", dot: "bg-violet-500", label: "Purple" },
  { color: "bg-amber-50", dot: "bg-amber-500", label: "Amber" },
  { color: "bg-emerald-50", dot: "bg-emerald-500", label: "Green" },
  { color: "bg-rose-50", dot: "bg-rose-500", label: "Rose" },
  { color: "bg-cyan-50", dot: "bg-cyan-500", label: "Cyan" },
  { color: "bg-orange-50", dot: "bg-orange-500", label: "Orange" },
];

// ─── Candidate card ───────────────────────────────────────────────────────────

const CandidateCard: React.FC<{ candidate: any; onClick: () => void }> = ({
  candidate,
  onClick,
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: candidate.id });
  const style = transform
    ? { transform: `translate(${transform.x}px,${transform.y}px)`, zIndex: 50 }
    : undefined;
  const initials = (
    (candidate.fullName || candidate.username || "?")[0] || "?"
  ).toUpperCase();

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      {...listeners}
      {...attributes}
      className={`bg-white rounded-xl border border-gray-200 p-3.5 select-none cursor-grab active:cursor-grabbing
        hover:shadow-md hover:border-gray-300 transition-all duration-150 ${isDragging ? "opacity-30" : ""}`}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 text-sm truncate">
            {candidate.fullName || candidate.username || "Unknown"}
          </p>
          <p className="text-xs text-gray-400 truncate">
            {candidate.job?.translations?.[0]?.title || ""}
          </p>
        </div>
        {candidate.unreadCount > 0 && (
          <div className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 flex items-center justify-center animate-pulse">
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
  column: any;
  candidates: any[];
  onCardClick: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}> = ({ column, candidates, onCardClick, onArchive, onDelete, onRename }) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(column.name);

  const commitRename = () => {
    if (name.trim() && name !== column.name) onRename(column.id, name.trim());
    setEditing(false);
  };

  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className={`w-2 h-2 rounded-full ${column.dot}`} />
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setName(column.name);
                setEditing(false);
              }
            }}
            className="flex-1 text-xs font-semibold uppercase tracking-wider text-gray-500 bg-transparent border-b border-blue-400 outline-none"
          />
        ) : (
          <span
            className="flex-1 text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 truncate"
            onClick={() => setEditing(true)}
            title="Click to rename"
          >
            {column.name}
          </span>
        )}
        <span className="text-xs font-bold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
          {candidates.length}
        </span>
        <button
          onClick={() => onArchive(column.id)}
          className="text-gray-300 hover:text-amber-400 transition-colors text-xs leading-none"
          title="Archive this stage"
        >
          ⬇
        </button>
        <button
          onClick={() => onDelete(column.id)}
          className="text-gray-300 hover:text-red-500 transition-colors text-xs leading-none"
          title="Delete this stage"
        >
          🗑
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[120px] rounded-xl p-2 space-y-2 transition-colors duration-150 ${isOver ? "bg-blue-100 ring-2 ring-blue-300" : column.color}`}
      >
        {candidates.map((c) => (
          <CandidateCard
            key={c.id}
            candidate={c}
            onClick={() => onCardClick(c.id)}
          />
        ))}
        {candidates.length === 0 && (
          <div
            className={`text-center text-xs py-8 pointer-events-none ${isOver ? "text-blue-400 font-medium" : "text-gray-300"}`}
          >
            {isOver ? "✓ Drop here" : "Drop here"}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Special drop zones (Hire / Archive) ─────────────────────────────────────

const DropZone: React.FC<{
  id: string;
  label: string;
  icon: string;
  activeColor: string;
}> = ({ id, label, icon, activeColor }) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col items-center justify-center w-40 min-h-[120px] rounded-xl border-2 border-dashed transition-all duration-150 flex-shrink-0 select-none
        ${isOver ? `${activeColor} border-solid shadow-lg scale-105` : "border-gray-200 bg-white text-gray-300 hover:border-gray-300"}`}
    >
      <span className="text-2xl mb-1">{icon}</span>
      <span
        className={`text-xs font-semibold uppercase tracking-wider ${isOver ? "text-current" : "text-gray-300"}`}
      >
        {label}
      </span>
    </div>
  );
};

// ─── Add column form ──────────────────────────────────────────────────────────

const AddColumnForm: React.FC<{
  onAdd: (name: string, color: string, dot: string) => void;
  onCancel: () => void;
}> = ({ onAdd, onCancel }) => {
  const [name, setName] = useState("");
  const [preset, setPreset] = useState(0);

  return (
    <div className="w-72 flex-shrink-0 bg-white rounded-xl border-2 border-blue-200 p-4 space-y-3">
      <p className="text-sm font-semibold text-gray-700">New Stage</p>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim())
            onAdd(
              name.trim(),
              COLOR_PRESETS[preset].color,
              COLOR_PRESETS[preset].dot,
            );
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Stage name…"
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-blue-300"
      />
      <div className="flex gap-1.5 flex-wrap">
        {COLOR_PRESETS.map((p, i) => (
          <button
            key={i}
            onClick={() => setPreset(i)}
            className={`w-5 h-5 rounded-full ${p.dot} ring-2 ring-offset-1 transition-all ${preset === i ? "ring-gray-600 scale-110" : "ring-transparent hover:ring-gray-300"}`}
            title={p.label}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => {
            if (name.trim())
              onAdd(
                name.trim(),
                COLOR_PRESETS[preset].color,
                COLOR_PRESETS[preset].dot,
              );
          }}
          disabled={!name.trim()}
          className="btn-primary text-xs px-3 py-1.5 disabled:opacity-40"
        >
          Add
        </button>
        <button
          onClick={onCancel}
          className="btn-secondary text-xs px-3 py-1.5"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// ─── Detail Panel ─────────────────────────────────────────────────────────────

const DetailPanel: React.FC<{
  candidateId: string | null;
  columns: any[];
  onClose: () => void;
  onStatusChange: (
    id: string,
    status: string,
    columnId?: string | null,
  ) => void;
}> = ({ candidateId, columns, onClose, onStatusChange }) => {
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
    if (tab === "chat")
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tab]);

  useWebSocket({
    NEW_MESSAGE: (payload) => {
      if (payload?.candidateId !== candidateId) return;
      // Only add INBOUND messages via WebSocket.
      // Outbound messages (sent by admin) are already added optimistically in
      // handleSendMessage / handleSendFile — the server's broadcast would double them.
      if (payload?.message?.direction !== "inbound") return;
      setMessages((prev) => {
        // Deduplicate by id — guards against any race between load and WS delivery
        if (prev.some((m) => m.id === payload.message.id)) return prev;
        return [...prev, payload.message];
      });
    },
  });

  const handleStatusChange = async (newStatus: string) => {
    if (!candidate) return;
    await candidatesApi.update(candidate.id, { status: newStatus });
    setCandidate((c: any) => ({
      ...c,
      status: newStatus,
      columnId:
        newStatus === "hired" || newStatus === "archived" ? null : c.columnId,
    }));
    onStatusChange(candidate.id, newStatus);
    toast.success(`Status → ${newStatus}`);
  };

  const handleColumnChange = async (columnId: string) => {
    if (!candidate) return;
    await candidatesApi.update(candidate.id, { columnId });
    setCandidate((c: any) => ({ ...c, columnId }));
    onStatusChange(candidate.id, "active", columnId);
    toast.success("Stage updated");
  };

  const handleSendMessage = async () => {
    if (!msgText.trim() || !candidate || sending) return;
    setSending(true);
    try {
      const msg = await messagesApi.send(candidate.id, {
        text: msgText.trim(),
      });
      setMessages((prev) => [...prev, msg]);
      setMsgText("");
    } catch {
      toast.error("Failed to send");
    }
    setSending(false);
  };

  const handleSendFile = async (file: File) => {
    if (!candidate) return;
    try {
      const msg = await messagesApi.sendMedia(candidate.id, file, "document");
      setMessages((prev) => [...prev, msg]);
    } catch {
      toast.error("Failed to send file");
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim() || !candidate) return;
    const c = await candidatesApi.addComment(candidate.id, comment.trim());
    setCandidate((prev: any) => ({
      ...prev,
      comments: [...(prev.comments || []), c],
    }));
    setComment("");
  };

  if (!candidateId) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/10 z-30" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[420px] bg-white shadow-2xl z-40 flex flex-col">
        {loading || !candidate ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            Loading…
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold">
                {(
                  (candidate.fullName || candidate.username || "?")[0] || "?"
                ).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900 truncate">
                  {candidate.fullName || candidate.username || "Unknown"}
                </p>
                <p className="text-xs text-blue-500 truncate">
                  {candidate.job?.translations?.[0]?.title || ""}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 text-xl"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Status + Stage + Contact */}
              <div className="p-5 pb-0 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                      Status
                    </p>
                    <select
                      value={candidate.status}
                      onChange={(e) => handleStatusChange(e.target.value)}
                      className="w-full text-sm font-semibold text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
                    >
                      <option value="active">Active</option>
                      <option value="hired">Hired ✅</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                      Contact
                    </p>
                    <p className="text-sm font-semibold text-gray-700 truncate">
                      {candidate.phone ||
                        candidate.email ||
                        (candidate.username ? `@${candidate.username}` : "—")}
                    </p>
                  </div>
                </div>

                {candidate.status === "active" && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                      Stage
                    </p>
                    <select
                      value={candidate.columnId || ""}
                      onChange={(e) => handleColumnChange(e.target.value)}
                      className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
                    >
                      <option value="">— Unassigned —</option>
                      {columns.map((col: any) => (
                        <option key={col.id} value={col.id}>
                          {col.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Tabs */}
              <div className="flex mx-5 mt-4 border-b border-gray-100">
                {(["answers", "chat", "files"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-2 text-xs font-semibold capitalize border-b-2 -mb-px transition-colors ${tab === t ? "border-blue-500 text-blue-600" : "border-transparent text-gray-400 hover:text-gray-600"}`}
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

              {/* Answers tab */}
              {tab === "answers" && (
                <div className="p-5 space-y-4">
                  {candidate.answers?.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        🤖 Bot Answers
                      </p>
                      {candidate.answers.map((answer: any) => {
                        const q =
                          answer.question?.translations?.[0]?.text ||
                          "Question";
                        const isAttachment =
                          answer.question?.type === "attachment";
                        const a =
                          answer.option?.translations?.[0]?.text ||
                          answer.textValue ||
                          "—";
                        const matchedFile = isAttachment
                          ? candidate.files?.find((f: any) => f.fileName === a)
                          : null;
                        return (
                          <div key={answer.id}>
                            <p className="text-xs text-gray-400 mb-0.5">{q}</p>
                            {isAttachment && a !== "—" ? (
                              matchedFile ? (
                                <a
                                  href={filesApi.downloadUrl(matchedFile.id)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline"
                                >
                                  📎 {a}
                                </a>
                              ) : (
                                <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                                  📎 {a}
                                </p>
                              )
                            ) : (
                              <p className="text-sm font-semibold text-gray-800">
                                {a}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div
                    className={
                      candidate.answers?.length > 0
                        ? "border-t border-gray-100 pt-4"
                        : ""
                    }
                  >
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
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
                        className="w-9 h-9 rounded-xl bg-amber-100 hover:bg-amber-200 flex items-center justify-center text-amber-600 transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Chat tab */}
              {tab === "chat" && (
                <div className="flex flex-col h-[400px]">
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {messages.map((msg) => {
                      const isOut = msg.direction === "outbound";
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isOut ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${isOut ? "bg-blue-600 text-white rounded-tr-sm" : "bg-gray-100 text-gray-800 rounded-tl-sm"}`}
                          >
                            {msg.type === "text" && <p>{msg.text}</p>}
                            {msg.type === "photo" && (
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
                    })}
                    <div ref={chatBottomRef} />
                  </div>
                  <div className="p-3 border-t border-gray-100 flex gap-2">
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
                      className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
                    >
                      📎
                    </button>
                    <input
                      value={msgText}
                      onChange={(e) => setMsgText(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && !e.shiftKey && handleSendMessage()
                      }
                      placeholder="Message…"
                      className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300"
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={sending || !msgText.trim()}
                      className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center text-white transition-colors"
                    >
                      →
                    </button>
                  </div>
                </div>
              )}

              {/* Files tab */}
              {tab === "files" && (
                <div className="p-5">
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
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors mb-1"
                      >
                        <span className="text-2xl">📄</span>
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {f.fileName}
                          </p>
                          <p className="text-xs text-gray-400">
                            {format(new Date(f.createdAt), "MMM d, HH:mm")}
                          </p>
                        </div>
                      </a>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="p-4 border-t border-gray-100 space-y-2">
              {candidate.status !== "hired" && (
                <button
                  onClick={() => handleStatusChange("hired")}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  ✅ Mark as Hired
                </button>
              )}
              {candidate.status === "active" && (
                <button
                  onClick={() => handleStatusChange("archived")}
                  className="w-full py-2.5 border border-red-200 text-red-500 hover:bg-red-50 font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
                >
                  🗃 Archive Candidate
                </button>
              )}
              {candidate.status === "archived" && (
                <button
                  onClick={() => handleStatusChange("active")}
                  className="w-full py-2.5 border border-blue-200 text-blue-600 hover:bg-blue-50 font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
                >
                  ↩ Restore to Pipeline
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
};

// ─── Unassigned column (always-mounted droppable) ─────────────────────────────

const UnassignedColumn: React.FC<{
  candidates: any[];
  onCardClick: (id: string) => void;
}> = ({ candidates, onCardClick }) => {
  const { setNodeRef, isOver } = useDroppable({ id: "__unassigned__" });
  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="w-2 h-2 rounded-full bg-gray-300" />
        <span className="flex-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Unassigned
        </span>
        <span className="text-xs font-bold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
          {candidates.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[120px] rounded-xl p-2 space-y-2 transition-colors ${isOver ? "bg-blue-100 ring-2 ring-blue-300" : "bg-gray-100"}`}
      >
        {candidates.map((c) => (
          <CandidateCard
            key={c.id}
            candidate={c}
            onClick={() => onCardClick(c.id)}
          />
        ))}
      </div>
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

export const CandidatesPage: React.FC = () => {
  const [columns, setColumns] = useState<any[]>([]);
  const [allCandidates, setAllCandidates] = useState<any[]>([]);
  const [bots, setBots] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [filters, setFilters] = useState({ botId: "", jobId: "", search: "" });
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [addingColumn, setAddingColumn] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cols, result] = await Promise.all([
        columnsApi.list(),
        candidatesApi.list({ status: "active", limit: 500, page: 1 }),
      ]);
      setColumns(cols);
      setAllCandidates(result.candidates || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);
  useEffect(() => {
    Promise.all([botsApi.list(), jobsApi.list()]).then(([b, j]) => {
      setBots(b);
      setJobs(j);
    });
  }, []);

  useWebSocket({
    NEW_APPLICATION: () => fetchAll(),
    STATUS_CHANGE: () => fetchAll(),
    CANDIDATE_UPDATE: () => fetchAll(),
    NEW_MESSAGE: (payload) => {
      if (payload?.message?.direction !== "inbound") return;
      const { candidateId, unreadCount } = payload;
      if (!candidateId) return;
      setSelectedCandidateId((cur) => {
        if (cur === candidateId) {
          messagesApi.markAsRead(candidateId).catch(() => {});
        } else {
          setAllCandidates((prev) =>
            prev.map((c) =>
              c.id === candidateId
                ? { ...c, unreadCount: unreadCount ?? (c.unreadCount || 0) + 1 }
                : c,
            ),
          );
        }
        return cur;
      });
    },
    MESSAGES_READ: (payload) => {
      const { candidateId } = payload || {};
      if (candidateId)
        setAllCandidates((prev) =>
          prev.map((c) =>
            c.id === candidateId ? { ...c, unreadCount: 0 } : c,
          ),
        );
    },
  });

  const handleCardClick = useCallback(async (id: string) => {
    setSelectedCandidateId(id);
    setAllCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)),
    );
    messagesApi.markAsRead(id).catch(() => {});
  }, []);

  const handleDragStart = (e: DragStartEvent) =>
    setActiveId(e.active.id as string);

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const candidateId = active.id as string;
    const overId = over.id as string;
    const candidate = allCandidates.find((c) => c.id === candidateId);
    if (!candidate) return;

    if (overId === "__hire__") {
      setAllCandidates((prev) => prev.filter((c) => c.id !== candidateId));
      try {
        await candidatesApi.update(candidateId, { status: "hired" });
        toast.success("Candidate hired! 🎉");
      } catch {
        toast.error("Failed");
        fetchAll();
      }
      return;
    }
    if (overId === "__archive__") {
      setAllCandidates((prev) => prev.filter((c) => c.id !== candidateId));
      try {
        await candidatesApi.update(candidateId, { status: "archived" });
        toast.success("Candidate archived");
      } catch {
        toast.error("Failed");
        fetchAll();
      }
      return;
    }
    // Moving between columns
    const col = columns.find((c) => c.id === overId);
    if (!col || candidate.columnId === overId) return;
    setAllCandidates((prev) =>
      prev.map((c) => (c.id === candidateId ? { ...c, columnId: overId } : c)),
    );
    // Only send columnId — sending status:'active' would trigger the route's
    // individual-restore logic which clears columnId, undoing the move.
    try {
      await candidatesApi.update(candidateId, { columnId: overId });
    } catch {
      toast.error("Failed");
      fetchAll();
    }
  };

  const handleAddColumn = async (name: string, color: string, dot: string) => {
    try {
      const col = await columnsApi.create({ name, color, dot });
      setColumns((prev) => [...prev, col]);
      setAddingColumn(false);
      toast.success(`Stage "${name}" created`);
    } catch {
      toast.error("Failed to create stage");
    }
  };

  const handleArchiveColumn = async (id: string) => {
    const col = columns.find((c) => c.id === id);
    if (
      !confirm(
        `Archive stage "${col?.name}"? All candidates inside it will be archived too.`,
      )
    )
      return;
    await columnsApi.archive(id);
    setColumns((prev) => prev.filter((c) => c.id !== id));
    // Remove archived candidates from the board (they are now archived, not active)
    setAllCandidates((prev) => prev.filter((c) => c.columnId !== id));
    toast.success(`Stage "${col?.name}" and its candidates archived`);
  };

  const handleDeleteColumn = async (id: string) => {
    const col = columns.find((c) => c.id === id);
    if (
      !confirm(
        `Delete stage "${col?.name}"? Candidates inside will move to Unassigned.`,
      )
    )
      return;
    await columnsApi.delete(id);
    setColumns((prev) => prev.filter((c) => c.id !== id));
    // Candidates become active+unassigned (handled by backend), reflect in state
    setAllCandidates((prev) =>
      prev.map((c) => (c.columnId === id ? { ...c, columnId: null } : c)),
    );
    toast.success(`Stage "${col?.name}" deleted`);
  };

  const handleRenameColumn = async (id: string, name: string) => {
    await columnsApi.update(id, { name });
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  };

  const handleStatusChangeFromPanel = (
    id: string,
    status: string,
    columnId?: string | null,
  ) => {
    if (status === "hired" || status === "archived") {
      setAllCandidates((prev) => prev.filter((c) => c.id !== id));
    } else {
      setAllCandidates((prev) =>
        prev.map((c) =>
          c.id === id
            ? {
                ...c,
                status,
                columnId: columnId !== undefined ? columnId : c.columnId,
              }
            : c,
        ),
      );
    }
  };

  const filteredJobs = filters.botId
    ? jobs.filter((j) => j.botId === filters.botId)
    : jobs;

  const visibleCandidates = allCandidates.filter((c) => {
    if (filters.botId && c.botId !== filters.botId) return false;
    if (filters.jobId && c.jobId !== filters.jobId) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      return (
        (c.fullName || "").toLowerCase().includes(q) ||
        (c.phone || "").includes(q) ||
        (c.username || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const uncolumned = visibleCandidates.filter((c) => !c.columnId);
  const activeCandidate = activeId
    ? allCandidates.find((c) => c.id === activeId)
    : null;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pipeline</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {visibleCandidates.length} active candidates
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search…"
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
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none bg-white"
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
            className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none bg-white"
          >
            <option value="">All jobs</option>
            {filteredJobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.translations?.[0]?.title || "Untitled"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Loading…
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div
              className="flex gap-5 p-6 h-full items-start"
              style={{ minWidth: "max-content" }}
            >
              {/* Unassigned column — always visible */}
              <UnassignedColumn
                candidates={uncolumned}
                onCardClick={handleCardClick}
              />

              {/* Custom columns */}
              {columns.map((col) => (
                <KanbanColumn
                  key={col.id}
                  column={col}
                  candidates={visibleCandidates.filter(
                    (c) => c.columnId === col.id,
                  )}
                  onCardClick={handleCardClick}
                  onArchive={handleArchiveColumn}
                  onDelete={handleDeleteColumn}
                  onRename={handleRenameColumn}
                />
              ))}

              {/* Add column button/form — always to the right of existing columns */}
              {addingColumn ? (
                <AddColumnForm
                  onAdd={handleAddColumn}
                  onCancel={() => setAddingColumn(false)}
                />
              ) : (
                <button
                  onClick={() => setAddingColumn(true)}
                  className="flex flex-col items-center justify-center w-40 min-h-[120px] rounded-xl border-2 border-dashed border-gray-200 text-gray-300 hover:border-blue-300 hover:text-blue-400 transition-all flex-shrink-0 gap-2 text-sm font-medium"
                >
                  <span className="text-2xl">+</span>
                  Add Stage
                </button>
              )}

              {/* Hire / Archive drop zones */}
              <div className="flex flex-col gap-3 flex-shrink-0 justify-start mt-10">
                <DropZone
                  id="__hire__"
                  label="Hire"
                  icon="✅"
                  activeColor="bg-emerald-100 text-emerald-700 border-emerald-400"
                />
                <DropZone
                  id="__archive__"
                  label="Archive"
                  icon="🗃"
                  activeColor="bg-gray-200 text-gray-600 border-gray-400"
                />
              </div>
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
      )}

      <DetailPanel
        candidateId={selectedCandidateId}
        columns={columns}
        onClose={() => setSelectedCandidateId(null)}
        onStatusChange={handleStatusChangeFromPanel}
      />
    </div>
  );
};
