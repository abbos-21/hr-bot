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
  columnsApi,
  questionsApi,
} from "../api";
import { useWebSocket } from "../hooks/useWebSocket";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { CandidateDetailPanel } from "../components/Candidatedetailpanel";

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

// ─── Broadcast modal ──────────────────────────────────────────────────────────

const BroadcastModal: React.FC<{
  columnName: string;
  candidateCount: number;
  onSend: (text: string) => Promise<void>;
  onClose: () => void;
}> = ({ columnName, candidateCount, onSend, onClose }) => {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTimeout(() => ref.current?.focus(), 60);
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await onSend(text.trim());
      onClose();
    } catch {
      toast.error("Broadcast failed");
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">📣 Notify column</h3>
          <p className="text-xs text-gray-400 mt-1">
            Sends the same message to <strong>{candidateCount}</strong>{" "}
            candidate{candidateCount !== 1 ? "s" : ""} in{" "}
            <strong>"{columnName}"</strong>.
          </p>
        </div>
        <div className="p-6 space-y-4">
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Type your message…"
            className="w-full text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
          />
          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending || candidateCount === 0}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-xl transition-colors"
            >
              {sending ? "Sending…" : `Send to ${candidateCount}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Confirm modal ────────────────────────────────────────────────────────────

const ConfirmModal: React.FC<{
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  onConfirm,
  onCancel,
}) => (
  <div
    className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4"
    onClick={onCancel}
  >
    <div
      className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
      onClick={(e) => e.stopPropagation()}
    >
      <h3 className="text-base font-bold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 mb-6 leading-relaxed">{message}</p>
      <div className="flex gap-3 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className={`px-4 py-2 text-sm font-semibold text-white rounded-xl transition-colors ${danger ? "bg-red-500 hover:bg-red-600" : "bg-amber-500 hover:bg-amber-600"}`}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

// ─── Candidate card ───────────────────────────────────────────────────────────

const CandidateCard: React.FC<{
  candidate: any;
  onClick: () => void;
  faded?: boolean;
}> = ({ candidate, onClick, faded }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: candidate.id, disabled: !!faded });
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
      className={`bg-white rounded-xl border border-gray-200 p-3.5 select-none
        hover:shadow-md hover:border-gray-300 transition-all duration-150
        ${faded ? "opacity-60 cursor-not-allowed" : "cursor-grab active:cursor-grabbing"}
        ${isDragging ? "opacity-30" : ""}`}
    >
      <div className="flex items-center gap-3">
        {candidate.profilePhoto ? (
          <img
            src={`/uploads/${candidate.botId}/${candidate.profilePhoto.split(/[\/\\]/).pop()}`}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-gray-100"
            alt=""
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 text-sm truncate">
            {candidate.fullName || candidate.username || "Unknown"}
          </p>
          {(candidate.age || candidate.position) && (
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              {candidate.position && (
                <span className="text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full truncate max-w-[120px]">
                  💼 {candidate.position}
                </span>
              )}
              {candidate.age && (
                <span className="text-xs text-gray-400">
                  {candidate.age.replace(/ \(.*\)/, "")}
                </span>
              )}
            </div>
          )}
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
  onBroadcast: (col: any, candidates: any[]) => void;
}> = ({
  column,
  candidates,
  onCardClick,
  onArchive,
  onDelete,
  onRename,
  onBroadcast,
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(column.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

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
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors text-xs font-bold"
          >
            ···
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden w-52">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onBroadcast(column, candidates);
                }}
                className="w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 font-medium border-b border-gray-100"
              >
                📣 Notify all candidates
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setEditing(true);
                }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
              >
                ✏️ Rename
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onArchive(column.id);
                }}
                className="w-full text-left px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 flex items-center gap-2"
              >
                ⬇ Archive stage
              </button>
              <div className="border-t border-gray-100" />
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(column.id);
                }}
                className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 flex items-center gap-2"
              >
                🗑 Delete stage
              </button>
            </div>
          )}
        </div>
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

// ─── In-Progress column (incomplete survey) ───────────────────────────────────

const InProgressColumn: React.FC<{
  candidates: any[];
  onCardClick: (id: string) => void;
  onBroadcast: (candidates: any[]) => void;
}> = ({ candidates, onCardClick, onBroadcast }) => {
  const { setNodeRef, isOver } = useDroppable({ id: "__inprogress__" });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div className="flex flex-col w-72 flex-shrink-0">
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="text-sm leading-none">⏳</span>
        <span className="flex-1 text-xs font-semibold text-amber-600 uppercase tracking-wider">
          In Progress
        </span>
        <span className="text-xs font-bold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
          {candidates.length}
        </span>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors text-xs font-bold"
          >
            ···
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden w-52">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onBroadcast(candidates);
                }}
                className="w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 font-medium"
              >
                📣 Notify all candidates
              </button>
            </div>
          )}
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[120px] rounded-xl p-2 space-y-2 transition-colors duration-150 ${isOver ? "bg-blue-100 ring-2 ring-blue-300" : "bg-amber-50"}`}
      >
        {candidates.length === 0 && (
          <div className="text-center text-xs py-8 text-amber-200 pointer-events-none">
            No candidates yet
          </div>
        )}
        {candidates.map((c) => (
          <CandidateCard
            key={c.id}
            candidate={c}
            onClick={() => onCardClick(c.id)}
            faded
          />
        ))}
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

// ─── Unassigned column ────────────────────────────────────────────────────────

const UnassignedColumn: React.FC<{
  candidates: any[];
  onCardClick: (id: string) => void;
  onBroadcast: (candidates: any[]) => void;
}> = ({ candidates, onCardClick, onBroadcast }) => {
  const { setNodeRef, isOver } = useDroppable({ id: "__unassigned__" });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

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
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors text-xs font-bold"
          >
            ···
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden w-52">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  onBroadcast(candidates);
                }}
                className="w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 font-medium"
              >
                📣 Notify all candidates
              </button>
            </div>
          )}
        </div>
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
  const [incompletes, setIncompletes] = useState<any[]>([]);
  const [bots, setBots] = useState<any[]>([]);
  const [filterQuestions, setFilterQuestions] = useState<any[]>([]);
  const [filters, setFilters] = useState({
    botId: "",
    search: "",
    questionId: "",
    optionId: "",
  });
  const [loading, setLoading] = useState(true);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    danger?: boolean;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [addingColumn, setAddingColumn] = useState(false);
  const [broadcast, setBroadcast] = useState<{
    name: string;
    candidates: any[];
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cols, result, inc] = await Promise.all([
        columnsApi.list(),
        candidatesApi.list({
          status: "active",
          limit: 500,
          page: 1,
          ...(filters.botId && { botId: filters.botId }),
          ...(filters.questionId &&
            filters.optionId && {
              questionId: filters.questionId,
              optionId: filters.optionId,
            }),
        }),
        candidatesApi.list({
          status: "incomplete",
          limit: 500,
          page: 1,
          ...(filters.botId && { botId: filters.botId }),
        }),
      ]);
      setColumns(cols);
      setAllCandidates(result.candidates || []);
      setIncompletes(inc.candidates || []);
    } catch {}
    setLoading(false);
  }, [filters.botId, filters.questionId, filters.optionId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);
  useEffect(() => {
    botsApi.list().then((b) => setBots(b));
  }, []);
  useEffect(() => {
    const params = filters.botId ? { botId: filters.botId } : {};
    questionsApi.list(params).then((qs: any[]) => {
      setFilterQuestions(
        qs.filter(
          (q: any) =>
            q.type === "choice" &&
            q.options?.length > 0 &&
            (!q.isRequired || q.filterLabel),
        ),
      );
    });
  }, [filters.botId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        filterPanelRef.current &&
        !filterPanelRef.current.contains(e.target as Node)
      )
        setFilterPanelOpen(false);
    };
    if (filterPanelOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [filterPanelOpen]);

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
    setIncompletes((prev) =>
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
    const candidate =
      allCandidates.find((c) => c.id === candidateId) ||
      incompletes.find((c) => c.id === candidateId);
    if (!candidate) return;

    if (overId === "__hire__") {
      setAllCandidates((prev) => prev.filter((c) => c.id !== candidateId));
      setIncompletes((prev) => prev.filter((c) => c.id !== candidateId));
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
      setIncompletes((prev) => prev.filter((c) => c.id !== candidateId));
      try {
        await candidatesApi.update(candidateId, { status: "archived" });
        toast.success("Candidate archived");
      } catch {
        toast.error("Failed");
        fetchAll();
      }
      return;
    }
    if (overId === "__inprogress__") return; // read-only
    if (overId === "__unassigned__") {
      if (candidate.columnId === null && candidate.status === "active") return;
      setAllCandidates((prev) => [
        ...prev.filter((c) => c.id !== candidateId),
        { ...candidate, columnId: null, status: "active" },
      ]);
      setIncompletes((prev) => prev.filter((c) => c.id !== candidateId));
      // Only send status:'active' for incomplete candidates — sending it for
      // already-active candidates triggers the backend restore logic that clears columnId.
      const isIncomplete = candidate.status === "incomplete";
      try {
        await candidatesApi.update(
          candidateId,
          isIncomplete
            ? { columnId: null, status: "active" }
            : { columnId: null },
        );
      } catch {
        toast.error("Failed");
        fetchAll();
      }
      return;
    }
    const col = columns.find((c) => c.id === overId);
    if (!col) return;
    if (candidate.columnId === overId && candidate.status === "active") return;
    setAllCandidates((prev) => [
      ...prev.filter((c) => c.id !== candidateId),
      { ...candidate, columnId: overId, status: "active" },
    ]);
    setIncompletes((prev) => prev.filter((c) => c.id !== candidateId));
    // Same rule: only send status:'active' when promoting an incomplete candidate.
    const isIncomplete = candidate.status === "incomplete";
    try {
      await candidatesApi.update(
        candidateId,
        isIncomplete
          ? { columnId: overId, status: "active" }
          : { columnId: overId },
      );
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

  const handleArchiveColumn = (id: string) => {
    const col = columns.find((c) => c.id === id);
    setConfirmModal({
      title: `Archive stage "${col?.name}"?`,
      message: "All candidates inside this stage will be archived too.",
      confirmLabel: "Archive",
      danger: false,
      onConfirm: async () => {
        setConfirmModal(null);
        await columnsApi.archive(id);
        setColumns((prev) => prev.filter((c) => c.id !== id));
        setAllCandidates((prev) => prev.filter((c) => c.columnId !== id));
        toast.success(`Stage "${col?.name}" archived`);
      },
    });
  };

  const handleDeleteColumn = (id: string) => {
    const col = columns.find((c) => c.id === id);
    setConfirmModal({
      title: `Delete stage "${col?.name}"?`,
      message: "Candidates inside will move to Unassigned.",
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        await columnsApi.delete(id);
        setColumns((prev) => prev.filter((c) => c.id !== id));
        setAllCandidates((prev) =>
          prev.map((c) => (c.columnId === id ? { ...c, columnId: null } : c)),
        );
        toast.success(`Stage "${col?.name}" deleted`);
      },
    });
  };

  const handleRenameColumn = async (id: string, name: string) => {
    await columnsApi.update(id, { name });
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  };

  const handleBroadcastSend = async (text: string) => {
    if (!broadcast) return;
    const result = await messagesApi.broadcast(
      broadcast.candidates.map((c) => c.id),
      text,
    );
    toast.success(
      `Sent to ${result.sent}${result.failed > 0 ? `, ${result.failed} failed` : ""}`,
    );
  };

  const handleStatusChangeFromPanel = (
    id: string,
    status: string,
    columnId?: string | null,
  ) => {
    if (status === "hired" || status === "archived") {
      setAllCandidates((prev) => prev.filter((c) => c.id !== id));
      setIncompletes((prev) => prev.filter((c) => c.id !== id));
    } else if (status === "active") {
      setIncompletes((prev) => prev.filter((c) => c.id !== id));
      setAllCandidates((prev) => {
        if (prev.find((c) => c.id === id))
          return prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  status,
                  columnId: columnId !== undefined ? columnId : c.columnId,
                }
              : c,
          );
        fetchAll();
        return prev;
      });
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

  const visibleCandidates = allCandidates.filter((c) => {
    if (!filters.search) return true;
    const q = filters.search.toLowerCase();
    return (
      (c.fullName || "").toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.username || "").toLowerCase().includes(q)
    );
  });

  const visibleInc = incompletes.filter((c) => {
    if (!filters.search) return true;
    const q = filters.search.toLowerCase();
    return (
      (c.fullName || "").toLowerCase().includes(q) ||
      (c.username || "").toLowerCase().includes(q)
    );
  });

  const uncolumned = visibleCandidates.filter((c) => !c.columnId);
  const activeCandidate = activeId
    ? allCandidates.find((c) => c.id === activeId) ||
      incompletes.find((c) => c.id === activeId)
    : null;

  return (
    <>
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          danger={confirmModal.danger}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
      {broadcast && (
        <BroadcastModal
          columnName={broadcast.name}
          candidateCount={broadcast.candidates.length}
          onSend={handleBroadcastSend}
          onClose={() => setBroadcast(null)}
        />
      )}
      <div className="flex flex-col h-full overflow-hidden bg-gray-50">
        {/* Top bar */}
        <div className="px-6 py-3 bg-white border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Pipeline</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {visibleCandidates.length} active · {visibleInc.length} in
                progress
              </p>
            </div>

            <div className="flex items-center gap-2 flex-1 justify-end">
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {filters.botId && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-violet-100 text-violet-700">
                    🤖 {bots.find((b) => b.id === filters.botId)?.name || "Bot"}
                    <button
                      onClick={() =>
                        setFilters((f) => ({
                          ...f,
                          botId: "",
                          questionId: "",
                          optionId: "",
                        }))
                      }
                      className="ml-0.5 hover:opacity-70 font-bold"
                    >
                      ×
                    </button>
                  </span>
                )}
                {filters.questionId &&
                  filters.optionId &&
                  (() => {
                    const q = filterQuestions.find(
                      (q: any) => q.id === filters.questionId,
                    );
                    const opt = q?.options?.find(
                      (o: any) => o.id === filters.optionId,
                    );
                    if (!q || !opt) return null;
                    return (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">
                        🔽 {q.filterLabel || q.translations?.[0]?.text}:{" "}
                        {opt.translations?.[0]?.text}
                        <button
                          onClick={() =>
                            setFilters((f) => ({
                              ...f,
                              questionId: "",
                              optionId: "",
                            }))
                          }
                          className="ml-0.5 hover:opacity-70 font-bold"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })()}
              </div>

              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                  🔍
                </span>
                <input
                  type="text"
                  placeholder="Search…"
                  value={filters.search}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, search: e.target.value }))
                  }
                  className="pl-7 pr-3 w-44 text-sm border border-gray-200 rounded-xl py-2 focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                />
              </div>

              <div className="relative" ref={filterPanelRef}>
                {(() => {
                  const activeCount = [
                    filters.botId ? 1 : 0,
                    filters.questionId ? 1 : 0,
                  ].reduce((a, b) => a + b, 0);
                  return (
                    <button
                      onClick={() => setFilterPanelOpen((o) => !o)}
                      className={`flex items-center gap-2 text-sm font-medium px-3.5 py-2 rounded-xl border transition-all
                        ${filterPanelOpen || activeCount > 0 ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600"}`}
                    >
                      <svg
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-4 h-4"
                      >
                        <path
                          fillRule="evenodd"
                          d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V15a1 1 0 01-.553.894l-4 2A1 1 0 017 17v-6.586L3.293 6.707A1 1 0 013 6V3z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Filters
                      {activeCount > 0 && (
                        <span className="w-5 h-5 rounded-full bg-white text-blue-600 text-xs font-bold flex items-center justify-center">
                          {activeCount}
                        </span>
                      )}
                    </button>
                  );
                })()}
                {filterPanelOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl border border-gray-200 shadow-2xl z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                      <span className="text-sm font-bold text-gray-900">
                        Filters
                      </span>
                      <button
                        onClick={() =>
                          setFilters((f) => ({
                            ...f,
                            botId: "",
                            questionId: "",
                            optionId: "",
                          }))
                        }
                        className="text-xs text-gray-400 hover:text-red-500 font-medium"
                      >
                        Reset all
                      </button>
                    </div>
                    <div className="p-4 space-y-5 max-h-[70vh] overflow-y-auto">
                      {bots.length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5">
                            Bot
                          </p>
                          <div className="space-y-1.5">
                            {[{ id: "", name: "All bots" }, ...bots].map(
                              (b) => {
                                const selected = filters.botId === b.id;
                                return (
                                  <label
                                    key={b.id}
                                    className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors ${selected ? "bg-violet-50 border border-violet-200" : "hover:bg-gray-50 border border-transparent"}`}
                                    onClick={() =>
                                      setFilters((f) => ({
                                        ...f,
                                        botId: b.id,
                                        questionId: "",
                                        optionId: "",
                                      }))
                                    }
                                  >
                                    <div
                                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selected ? "border-violet-600" : "border-gray-300"}`}
                                    >
                                      {selected && (
                                        <div className="w-2 h-2 rounded-full bg-violet-600" />
                                      )}
                                    </div>
                                    <span className="text-sm text-gray-700 font-medium">
                                      {b.id ? "🤖 " : ""}
                                      {b.name}
                                    </span>
                                  </label>
                                );
                              },
                            )}
                          </div>
                        </div>
                      )}
                      {filterQuestions.map((q: any) => {
                        const qLabel =
                          q.filterLabel ||
                          q.translations?.[0]?.text ||
                          "Filter";
                        return (
                          <div key={q.id}>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2.5">
                              {qLabel}
                            </p>
                            <div className="space-y-1.5">
                              {[
                                { id: "", text: "Any" },
                                ...q.options.map((o: any) => ({
                                  id: o.id,
                                  text: o.translations?.[0]?.text || "Option",
                                })),
                              ].map((opt) => {
                                const selected =
                                  opt.id === ""
                                    ? filters.questionId !== q.id
                                    : filters.questionId === q.id &&
                                      filters.optionId === opt.id;
                                return (
                                  <label
                                    key={opt.id || "__any__"}
                                    className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors ${selected ? "bg-indigo-50 border border-indigo-200" : "hover:bg-gray-50 border border-transparent"}`}
                                    onClick={() =>
                                      setFilters((f) => ({
                                        ...f,
                                        questionId: opt.id ? q.id : "",
                                        optionId: opt.id || "",
                                      }))
                                    }
                                  >
                                    <div
                                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selected ? "border-indigo-600" : "border-gray-300"}`}
                                    >
                                      {selected && (
                                        <div className="w-2 h-2 rounded-full bg-indigo-600" />
                                      )}
                                    </div>
                                    <span className="text-sm text-gray-700 font-medium">
                                      {opt.text}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                      <button
                        onClick={() => setFilterPanelOpen(false)}
                        className="w-full text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl py-2 transition-colors"
                      >
                        Apply Filters
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
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
                <InProgressColumn
                  candidates={visibleInc}
                  onCardClick={handleCardClick}
                  onBroadcast={(cands) =>
                    setBroadcast({ name: "In Progress", candidates: cands })
                  }
                />

                <UnassignedColumn
                  candidates={uncolumned}
                  onCardClick={handleCardClick}
                  onBroadcast={(cands) =>
                    setBroadcast({ name: "Unassigned", candidates: cands })
                  }
                />

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
                    onBroadcast={(col, cands) =>
                      setBroadcast({ name: col.name, candidates: cands })
                    }
                  />
                ))}

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
                    <p className="font-semibold text-gray-800 text-sm">
                      {activeCandidate.fullName ||
                        activeCandidate.username ||
                        "Unknown"}
                    </p>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        <CandidateDetailPanel
          candidateId={selectedCandidateId}
          columns={columns}
          onClose={() => setSelectedCandidateId(null)}
          onStatusChange={handleStatusChangeFromPanel}
        />
      </div>
    </>
  );
};
