/**
 * CandidateDetailPanel
 *
 * Two modes:
 *  inline=false (default) - Pipeline: fixed right-side overlay with dark backdrop
 *  inline=true            - Chats: plain flex column inside parent container
 */
import React, { useEffect, useState, useRef } from "react";
import { format } from "date-fns";
import { candidatesApi, messagesApi, filesApi, columnsApi, meetingsApi } from "../api";
import { useWebSocket } from "../hooks/useWebSocket";
import toast from "react-hot-toast";
import { useT } from "../i18n";
import { isViewableInBrowser } from "../utils/media";

interface Props {
  candidateId: string | null;
  columns?: any[] | null;
  onClose: () => void;
  onStatusChange?: (
    id: string,
    status: string,
    columnId?: string | null,
  ) => void;
  /** inline=true: no fixed overlay, renders as plain block inside parent */
  inline?: boolean;
}

export const CandidateDetailPanel: React.FC<Props> = ({
  candidateId,
  columns: columnsProp,
  onClose,
  onStatusChange,
  inline = false,
}) => {
  const { t } = useT();
  const [candidate, setCandidate] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [columns, setColumns] = useState<any[]>(columnsProp ?? []);
  const [tab, setTab] = useState<"answers" | "chat" | "files" | "meetings">("answers");
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [meetingForm, setMeetingForm] = useState({
    scheduledAt: "",
    note: "",
    reminderMinutes: 30,
  });
  const [schedulingMeeting, setSchedulingMeeting] = useState(false);

  useEffect(() => {
    if (columnsProp !== undefined) {
      setColumns(columnsProp ?? []);
      return;
    }
    columnsApi
      .list()
      .then(setColumns)
      .catch(() => {});
  }, [columnsProp]);

  useEffect(() => {
    if (!candidateId) {
      setCandidate(null);
      return;
    }
    setLoading(true);
    setTab("answers");
    Promise.all([
      candidatesApi.get(candidateId),
      messagesApi.list(candidateId),
      meetingsApi.list(candidateId),
    ])
      .then(([c, m, mt]) => {
        setCandidate(c);
        setMessages(m);
        setMeetings(mt);
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
      if (payload?.message?.direction !== "inbound") return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === payload.message.id)) return prev;
        return [...prev, payload.message];
      });
    },
  });

  const handleStatusChange = async (newStatus: string) => {
    if (!candidate) return;
    await candidatesApi.update(candidate.id, { status: newStatus });
    const updated = {
      ...candidate,
      status: newStatus,
      columnId:
        newStatus === "hired" || newStatus === "archived"
          ? null
          : candidate.columnId,
    };
    setCandidate(updated);
    onStatusChange?.(candidate.id, newStatus);
    toast.success(t("candidates.panel.statusUpdated"));
  };

  const handleColumnChange = async (columnId: string) => {
    if (!candidate) return;
    await candidatesApi.update(candidate.id, { columnId, status: "active" });
    setCandidate((c: any) => ({ ...c, columnId, status: "active" }));
    onStatusChange?.(candidate.id, "active", columnId);
    toast.success(t("candidates.panel.stageUpdated"));
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
      toast.error(t("candidates.panel.failedToSend"));
    }
    setSending(false);
  };

  const handleSendFile = async (file: File) => {
    if (!candidate) return;
    try {
      const msg = await messagesApi.sendMedia(candidate.id, file, "document");
      setMessages((prev) => [...prev, msg]);
    } catch {
      toast.error(t("candidates.panel.failedToSendFile"));
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

  const photoSrc = candidate?.profilePhoto
    ? `/uploads/${candidate.botId}/${candidate.profilePhoto.split(/[\\/]/).pop()}`
    : null;

  // ── Panel body (shared between overlay and inline modes) ────────────────────
  const panelBody =
    loading || !candidate ? (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Loading...
      </div>
    ) : (
      <>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div
            className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0 cursor-pointer"
            onClick={() => photoSrc && setLightboxSrc(photoSrc)}
          >
            {photoSrc ? (
              <img src={photoSrc} className="w-10 h-10 object-cover" alt="" />
            ) : (
              (
                (candidate.fullName || candidate.username || "?")[0] || "?"
              ).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 truncate">
              {candidate.fullName || candidate.username || "Unknown"}
            </p>
            <p className="text-xs text-gray-400">
              {candidate.username ? `@${candidate.username}` : "No username"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 text-xl leading-none"
          >
            x
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
                  <option value="incomplete">In Progress</option>
                  <option value="active">Active</option>
                  <option value="hired">Hired</option>
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
                    (candidate.username ? `@${candidate.username}` : "--")}
                </p>
              </div>
            </div>

            {candidate.status === "active" && columns.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Stage
                </p>
                <select
                  value={candidate.columnId || ""}
                  onChange={(e) => handleColumnChange(e.target.value)}
                  className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
                >
                  <option value="">-- Unassigned --</option>
                  {columns.map((col: any) => (
                    <option key={col.id} value={col.id}>
                      {col.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {candidate.status === "incomplete" && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 flex items-center gap-2">
                <span className="text-amber-500 text-sm">...</span>
                <p className="text-xs text-amber-700 font-medium">
                  Survey in progress - step {candidate.currentStep || 0}{" "}
                  completed
                </p>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex mx-5 mt-4 border-b border-gray-100">
            {(["answers", "chat", "files", "meetings"] as const).map((t) => (
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

          {/* Answers tab */}
          {tab === "answers" && (
            <div className="p-5 space-y-4">
              {(candidate.age || candidate.position) && (
                <div className="grid grid-cols-2 gap-2">
                  {candidate.age && (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                      <p className="text-xs text-amber-500 font-semibold uppercase tracking-wider mb-1">
                        Age
                      </p>
                      <p className="text-sm font-semibold text-gray-800">
                        {candidate.age}
                      </p>
                    </div>
                  )}
                  {candidate.position && (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                      <p className="text-xs text-indigo-500 font-semibold uppercase tracking-wider mb-1">
                        Position
                      </p>
                      <p className="text-sm font-semibold text-gray-800">
                        {candidate.position}
                      </p>
                    </div>
                  )}
                </div>
              )}
              {candidate.answers?.filter((a: any) => !a.question?.isRequired)
                .length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Bot Answers
                  </p>
                  {candidate.answers
                    .filter((a: any) => !a.question?.isRequired)
                    .map((answer: any) => {
                      const q =
                        answer.question?.translations?.[0]?.text || "Question";
                      const isAttachment =
                        answer.question?.type === "attachment";
                      const a =
                        answer.option?.translations?.[0]?.text ||
                        answer.textValue ||
                        "--";
                      const matchedFile = isAttachment
                        ? candidate.files?.find((f: any) => f.fileName === a)
                        : null;
                      return (
                        <div key={answer.id}>
                          <p className="text-xs text-gray-400 mb-0.5">{q}</p>
                          {isAttachment && a !== "--" ? (
                            matchedFile ? (
                              <a
                                href={filesApi.downloadUrl(matchedFile.id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:underline"
                              >
                                {a}
                              </a>
                            ) : (
                              <p className="text-sm font-semibold text-gray-800">
                                {a}
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
                  Notes
                </p>
                {(!candidate.comments || candidate.comments.length === 0) && (
                  <p className="text-xs text-gray-300 mb-2">No notes yet</p>
                )}
                {candidate.comments?.map((c: any) => (
                  <div
                    key={c.id}
                    className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-2"
                  >
                    <p className="text-sm text-gray-700">{c.text}</p>
                    <p className="text-xs text-amber-400 mt-1">
                      {c.admin?.name} {format(new Date(c.createdAt), "MMM d")}
                    </p>
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                    placeholder="Add a note..."
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
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                          isOut
                            ? "bg-blue-600 text-white rounded-tr-sm"
                            : "bg-gray-100 text-gray-800 rounded-tl-sm"
                        }`}
                      >
                        {msg.type === "text" && <p>{msg.text}</p>}
                        {msg.type === "photo" && (
                          <img
                            src={filesApi.serveUrl(msg.id)}
                            alt="photo"
                            className="max-w-full rounded max-h-40 object-cover cursor-zoom-in"
                            onClick={() =>
                              setLightboxSrc(filesApi.serveUrl(msg.id))
                            }
                          />
                        )}
                        {msg.type === "document" &&
                          (() => {
                            const viewable = isViewableInBrowser(msg.mimeType);
                            return (
                              <a
                                href={filesApi.serveUrl(msg.id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                {...(!viewable
                                  ? { download: msg.fileName }
                                  : {})}
                                className={`flex items-center gap-1 ${isOut ? "text-blue-100" : "text-blue-600"}`}
                              >
                                {msg.fileName || "File"}
                              </a>
                            );
                          })()}
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
                  clip
                </button>
                <input
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !e.shiftKey && handleSendMessage()
                  }
                  placeholder="Message..."
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={sending || !msgText.trim()}
                  className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center text-white transition-colors"
                >
                  &rarr;
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
                candidate.files.map((f: any) => {
                  const viewable = isViewableInBrowser(f.mimeType);
                  return (
                    <a
                      key={f.id}
                      href={
                        viewable
                          ? filesApi.serveFileUrl(f.id)
                          : filesApi.downloadUrl(f.id)
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      {...(!viewable ? { download: f.fileName } : {})}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors mb-1"
                    >
                      <span className="text-2xl">
                        {f.mimeType === "application/pdf"
                          ? "pdf"
                          : viewable
                            ? "img"
                            : "doc"}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {f.fileName}
                        </p>
                        <p className="text-xs text-gray-400">
                          {format(new Date(f.createdAt), "MMM d, HH:mm")}
                        </p>
                      </div>
                    </a>
                  );
                })
              )}
            </div>
          )}

          {/* Meetings tab */}
          {tab === "meetings" && (
            <div className="p-5 space-y-3">
              <button
                onClick={() => {
                  setShowMeetingForm(!showMeetingForm);
                  setMeetingForm({ scheduledAt: "", note: "", reminderMinutes: 30 });
                }}
                className="w-full py-2 text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
              >
                {showMeetingForm ? t("common.cancel") : t("meetings.schedule")}
              </button>

              {showMeetingForm && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {t("meetings.dateTime")}
                    </label>
                    <input
                      type="datetime-local"
                      value={meetingForm.scheduledAt}
                      onChange={(e) =>
                        setMeetingForm((f) => ({ ...f, scheduledAt: e.target.value }))
                      }
                      className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {t("meetings.note")}
                    </label>
                    <textarea
                      value={meetingForm.note}
                      onChange={(e) =>
                        setMeetingForm((f) => ({ ...f, note: e.target.value }))
                      }
                      placeholder={t("meetings.notePlaceholder")}
                      rows={2}
                      className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {t("meetings.reminderBefore")}
                    </label>
                    <select
                      value={meetingForm.reminderMinutes}
                      onChange={(e) =>
                        setMeetingForm((f) => ({
                          ...f,
                          reminderMinutes: Number(e.target.value),
                        }))
                      }
                      className="w-full mt-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300"
                    >
                      <option value={10}>10 {t("meetings.minutes")}</option>
                      <option value={15}>15 {t("meetings.minutes")}</option>
                      <option value={30}>30 {t("meetings.minutes")}</option>
                      <option value={60}>1 {t("meetings.hour")}</option>
                      <option value={120}>2 {t("meetings.hours")}</option>
                      <option value={1440}>1 {t("meetings.day")}</option>
                    </select>
                  </div>
                  <button
                    disabled={schedulingMeeting || !meetingForm.scheduledAt}
                    onClick={async () => {
                      setSchedulingMeeting(true);
                      try {
                        const m = await meetingsApi.create({
                          candidateId: candidate.id,
                          scheduledAt: new Date(meetingForm.scheduledAt).toISOString(),
                          note: meetingForm.note || undefined,
                          reminderMinutes: meetingForm.reminderMinutes,
                        });
                        setMeetings((prev) => [m, ...prev]);
                        setShowMeetingForm(false);
                        setMeetingForm({ scheduledAt: "", note: "", reminderMinutes: 30 });
                        toast.success(t("meetings.scheduled"));
                      } catch {
                        toast.error(t("meetings.scheduleFailed"));
                      }
                      setSchedulingMeeting(false);
                    }}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors text-sm"
                  >
                    {schedulingMeeting
                      ? t("common.saving")
                      : t("meetings.schedule")}
                  </button>
                </div>
              )}

              {meetings.length === 0 && !showMeetingForm && (
                <p className="text-sm text-gray-400 text-center py-4">
                  {t("meetings.noMeetings")}
                </p>
              )}

              {meetings.map((m) => {
                const dt = new Date(m.scheduledAt);
                const isPast = dt < new Date();
                return (
                  <div
                    key={m.id}
                    className={`rounded-xl border p-3 ${
                      m.status === "cancelled"
                        ? "border-gray-200 bg-gray-50 opacity-60"
                        : isPast
                          ? "border-amber-200 bg-amber-50"
                          : "border-blue-200 bg-blue-50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">
                          {format(dt, "MMM d, yyyy")} {t("meetings.at")}{" "}
                          {format(dt, "HH:mm")}
                        </p>
                        {m.note && (
                          <p className="text-xs text-gray-500 mt-1">{m.note}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {t("meetings.reminder")}: {m.reminderMinutes}{" "}
                          {t("meetings.minBefore")}
                          {m.reminderSent && (
                            <span className="ml-1 text-green-500">
                              ({t("meetings.sent")})
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {m.status === "scheduled" && (
                          <button
                            onClick={async () => {
                              try {
                                await meetingsApi.update(m.id, {
                                  status: "cancelled",
                                });
                                setMeetings((prev) =>
                                  prev.map((mt) =>
                                    mt.id === m.id
                                      ? { ...mt, status: "cancelled" }
                                      : mt,
                                  ),
                                );
                              } catch {
                                toast.error(t("common.update") + " failed");
                              }
                            }}
                            className="text-xs px-2 py-1 rounded-lg text-red-600 hover:bg-red-100 transition-colors"
                          >
                            {t("common.cancel")}
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            try {
                              await meetingsApi.delete(m.id);
                              setMeetings((prev) =>
                                prev.filter((mt) => mt.id !== m.id),
                              );
                            } catch {
                              toast.error(t("common.delete") + " failed");
                            }
                          }}
                          className="text-xs px-2 py-1 rounded-lg text-gray-400 hover:bg-gray-200 transition-colors"
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-gray-100 space-y-2 flex-shrink-0">
          {candidate.status === "incomplete" && (
            <button
              onClick={() => handleStatusChange("active")}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
            >
              Move to Pipeline
            </button>
          )}
          {candidate.status !== "hired" &&
            candidate.status !== "incomplete" && (
              <button
                onClick={() => handleStatusChange("hired")}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                Mark as Hired
              </button>
            )}
          {candidate.status === "active" && (
            <button
              onClick={() => handleStatusChange("archived")}
              className="w-full py-2.5 border border-red-200 text-red-500 hover:bg-red-50 font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
            >
              Archive Candidate
            </button>
          )}
          {candidate.status === "archived" && (
            <button
              onClick={() => handleStatusChange("active")}
              className="w-full py-2.5 border border-blue-200 text-blue-600 hover:bg-blue-50 font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors text-sm"
            >
              Restore to Pipeline
            </button>
          )}
        </div>
      </>
    );

  // ── Lightbox (shared) ───────────────────────────────────────────────────────
  const lightbox = lightboxSrc ? (
    <div
      className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center"
      onClick={() => setLightboxSrc(null)}
    >
      <img
        src={lightboxSrc}
        alt=""
        className="max-w-[90vw] max-h-[90vh] rounded-2xl object-contain shadow-2xl"
      />
      <button className="absolute top-4 right-4 text-white text-3xl leading-none opacity-70 hover:opacity-100">
        x
      </button>
    </div>
  ) : null;

  // ── Inline mode: plain block, no fixed overlay ──────────────────────────────
  if (inline) {
    return (
      <>
        <div className="flex flex-col h-full">{panelBody}</div>
        {lightbox}
      </>
    );
  }

  // ── Overlay mode: fixed panel with backdrop ─────────────────────────────────
  return (
    <>
      <div className="fixed inset-0 bg-black/10 z-30" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[420px] bg-white shadow-2xl z-40 flex flex-col">
        {panelBody}
      </div>
      {lightbox}
    </>
  );
};
