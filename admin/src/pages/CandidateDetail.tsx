import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { candidatesApi, messagesApi, filesApi } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { useWebSocket } from "../hooks/useWebSocket";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { useAuthStore } from "../store/auth";

const STATUSES = [
  "incomplete",
  "applied",
  "screening",
  "interviewing",
  "offered",
  "hired",
  "rejected",
  "archived",
];

export const CandidateDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { admin } = useAuthStore();
  const [candidate, setCandidate] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<
    "chat" | "profile" | "answers" | "files" | "comments"
  >("chat");
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const [comment, setComment] = useState("");
  const [editProfile, setEditProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<any>({});
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    const [c, m] = await Promise.all([
      candidatesApi.get(id),
      messagesApi.list(id),
    ]);
    setCandidate(c);
    setMessages(m);
    setProfileForm({
      fullName: c.fullName || "",
      age: c.age || "",
      phone: c.phone || "",
      email: c.email || "",
    });
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (tab === "chat") {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, tab]);

  useWebSocket({
    NEW_MESSAGE: (payload) => {
      if (payload?.candidateId !== id) return;
      // Only inbound – outbound already added from API response
      if (payload?.message?.direction !== "inbound") return;
      setMessages((prev) => {
        if (prev.find((m) => m.id === payload.message.id)) return prev;
        return [...prev, payload.message];
      });
    },
  });

  const handleSendText = async () => {
    if (!msgText.trim() || !id) return;
    setSending(true);
    try {
      const msg = await messagesApi.send(id, { text: msgText, type: "text" });
      setMessages((prev) => [...prev, msg]);
      setMsgText("");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const handleSendFile = async (file: File) => {
    if (!id) return;
    setSending(true);
    try {
      const msg = await messagesApi.sendMedia(id, file, "document");
      setMessages((prev) => [...prev, msg]);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to send file");
    } finally {
      setSending(false);
      setUploadFile(null);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!id) return;
    try {
      const updated = await candidatesApi.update(id, { status });
      setCandidate((c: any) => ({ ...c, status: updated.status }));
      toast.success(`Status updated to ${status}`);
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleSaveProfile = async () => {
    if (!id) return;
    try {
      const updated = await candidatesApi.update(id, profileForm);
      setCandidate((c: any) => ({ ...c, ...updated }));
      setEditProfile(false);
      toast.success("Profile saved");
    } catch {
      toast.error("Failed to save");
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim() || !id) return;
    try {
      const c = await candidatesApi.addComment(id, comment);
      setCandidate((prev: any) => ({
        ...prev,
        comments: [...(prev.comments || []), c],
      }));
      setComment("");
      toast.success("Comment added");
    } catch {
      toast.error("Failed to add comment");
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!id || !confirm("Delete comment?")) return;
    try {
      await candidatesApi.deleteComment(id, commentId);
      setCandidate((prev: any) => ({
        ...prev,
        comments: prev.comments.filter((c: any) => c.id !== commentId),
      }));
    } catch {
      toast.error("Failed to delete");
    }
  };

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>;
  if (!candidate)
    return <div className="p-8 text-gray-400">Candidate not found</div>;

  return (
    <div className="p-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link
            to="/candidates"
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            ← Candidates
          </Link>
          <span className="text-gray-300">/</span>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-lg font-bold text-blue-700">
              {(candidate.fullName ||
                candidate.username ||
                "?")[0].toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {candidate.fullName ||
                  candidate.username ||
                  "Unknown Candidate"}
              </h1>
              <p className="text-sm text-gray-400">
                {candidate.job?.translations?.[0]?.title || "N/A"} · TG:{" "}
                {candidate.telegramId}
              </p>
            </div>
          </div>
        </div>

        {/* Status selector */}
        <div className="flex items-center gap-3">
          <StatusBadge status={candidate.status} className="text-sm" />
          <select
            value={candidate.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="input w-40 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(["chat", "profile", "answers", "files", "comments"] as const).map(
          (t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
                tab === t
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t}
              {t === "chat" && messages.length > 0 && (
                <span className="ml-1 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
                  {messages.length}
                </span>
              )}
              {t === "comments" && candidate.comments?.length > 0 && (
                <span className="ml-1 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {candidate.comments.length}
                </span>
              )}
            </button>
          ),
        )}
      </div>

      {/* Chat Tab */}
      {tab === "chat" && (
        <div className="flex flex-col h-[calc(100vh-280px)] card">
          {candidate.status === "incomplete" && (
            <div className="p-3 bg-yellow-50 border-b border-yellow-200 text-sm text-yellow-700">
              ⚠️ Messaging is available once candidate submits their application
              (status: Applied+)
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                No messages yet
              </div>
            ) : (
              messages.map((msg) => {
                const isOutbound = msg.direction === "outbound";
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                        isOutbound
                          ? "bg-blue-600 text-white rounded-br-sm"
                          : "bg-gray-100 text-gray-900 rounded-bl-sm"
                      }`}
                    >
                      {msg.type === "text" && (
                        <p className="text-sm">{msg.text}</p>
                      )}
                      {msg.type === "photo" && (
                        <div>
                          {msg.localPath ? (
                            <img
                              src={filesApi.serveUrl(msg.id)}
                              alt="photo"
                              className="max-w-full rounded-lg max-h-64 object-cover"
                            />
                          ) : (
                            <p className="text-sm italic">📷 Photo</p>
                          )}
                          {msg.text && (
                            <p className="text-sm mt-1">{msg.text}</p>
                          )}
                        </div>
                      )}
                      {msg.type === "document" && (
                        <a
                          href={filesApi.serveUrl(msg.id)}
                          download={msg.fileName}
                          className={`flex items-center gap-2 text-sm ${isOutbound ? "text-blue-100" : "text-blue-600"}`}
                        >
                          📎 {msg.fileName || "Document"}
                        </a>
                      )}
                      {msg.type === "voice" && (
                        <div>
                          <audio
                            controls
                            src={filesApi.serveUrl(msg.id)}
                            className="max-w-full"
                          />
                        </div>
                      )}
                      {["video", "audio"].includes(msg.type) && (
                        <p className="text-sm italic">🎵 {msg.type}</p>
                      )}
                      <p
                        className={`text-xs mt-1 ${isOutbound ? "text-blue-200" : "text-gray-400"}`}
                      >
                        {isOutbound ? msg.admin?.name || "Admin" : "Candidate"}{" "}
                        · {format(new Date(msg.createdAt), "HH:mm")}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Message input */}
          {candidate.status !== "incomplete" && (
            <div className="p-4 border-t border-gray-200">
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleSendFile(file);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                  title="Attach file"
                >
                  📎
                </button>
                <input
                  type="text"
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && !e.shiftKey && handleSendText()
                  }
                  placeholder="Type a message..."
                  className="input flex-1"
                  disabled={sending}
                />
                <button
                  onClick={handleSendText}
                  disabled={!msgText.trim() || sending}
                  className="btn-primary px-4"
                >
                  {sending ? "..." : "Send"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Profile Tab */}
      {tab === "profile" && (
        <div className="max-w-lg space-y-4">
          <div className="card p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Personal Information</h3>
              <button
                onClick={() => setEditProfile(!editProfile)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {editProfile ? "Cancel" : "Edit"}
              </button>
            </div>
            <div className="space-y-3">
              {[
                { label: "Full Name", key: "fullName" },
                { label: "Age", key: "age" },
                { label: "Phone", key: "phone" },
                { label: "Email", key: "email" },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="label">{label}</label>
                  {editProfile ? (
                    <input
                      type="text"
                      value={profileForm[key] || ""}
                      onChange={(e) =>
                        setProfileForm((f: any) => ({
                          ...f,
                          [key]: e.target.value,
                        }))
                      }
                      className="input"
                      placeholder={`Enter ${label.toLowerCase()}`}
                    />
                  ) : (
                    <p className="text-sm text-gray-700">
                      {(candidate as any)[key] || (
                        <span className="text-gray-400">Not provided</span>
                      )}
                    </p>
                  )}
                </div>
              ))}
              <div>
                <label className="label">Username</label>
                <p className="text-sm text-gray-700">
                  {candidate.username ? `@${candidate.username}` : "—"}
                </p>
              </div>
              <div>
                <label className="label">Telegram ID</label>
                <p className="text-sm text-gray-700">{candidate.telegramId}</p>
              </div>
              <div>
                <label className="label">Language</label>
                <p className="text-sm text-gray-700">{candidate.lang}</p>
              </div>
              <div>
                <label className="label">Applied</label>
                <p className="text-sm text-gray-700">
                  {format(new Date(candidate.createdAt), "PPpp")}
                </p>
              </div>
              <div>
                <label className="label">Last Activity</label>
                <p className="text-sm text-gray-700">
                  {format(new Date(candidate.lastActivity), "PPpp")}
                </p>
              </div>
            </div>
            {editProfile && (
              <button className="btn-primary mt-4" onClick={handleSaveProfile}>
                Save Profile
              </button>
            )}
          </div>
        </div>
      )}

      {/* Answers Tab */}
      {tab === "answers" && (
        <div className="max-w-2xl space-y-3">
          {candidate.answers?.length === 0 ? (
            <div className="card p-8 text-center text-gray-400">
              No answers recorded
            </div>
          ) : (
            candidate.answers?.map((answer: any) => {
              const questionText =
                answer.question?.translations?.[0]?.text || "Unknown question";
              const isAttachment = answer.question?.type === "attachment";
              const answerText =
                answer.option?.translations?.[0]?.text ||
                answer.textValue ||
                "—";
              const matchedFile = isAttachment
                ? candidate.files?.find((f: any) => f.fileName === answerText)
                : null;
              return (
                <div key={answer.id} className="card p-4">
                  <p className="text-sm font-medium text-gray-700 mb-1">
                    {questionText}
                  </p>
                  {isAttachment && answerText !== "—" ? (
                    matchedFile ? (
                      <a
                        href={filesApi.downloadUrl(matchedFile.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline bg-blue-50 rounded px-3 py-2"
                      >
                        📎 {answerText}
                      </a>
                    ) : (
                      <p className="inline-flex items-center gap-2 text-sm text-gray-900 bg-gray-50 rounded px-3 py-2">
                        📎 {answerText}
                      </p>
                    )
                  ) : (
                    <p className="text-sm text-gray-900 bg-gray-50 rounded px-3 py-2">
                      {answerText}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Files Tab */}
      {tab === "files" && (
        <div className="max-w-2xl space-y-2">
          {candidate.files?.length === 0 ? (
            <div className="card p-8 text-center text-gray-400">
              No files uploaded
            </div>
          ) : (
            candidate.files?.map((file: any) => (
              <div key={file.id} className="card p-4 flex items-center gap-3">
                <div className="text-2xl">📄</div>
                <div className="flex-1">
                  <p className="font-medium text-sm">{file.fileName}</p>
                  <p className="text-xs text-gray-400">
                    {file.mimeType} · {format(new Date(file.createdAt), "PPpp")}
                  </p>
                </div>
                <a
                  href={filesApi.downloadUrl(file.id)}
                  download={file.fileName}
                  className="btn-secondary text-sm py-1.5"
                >
                  Download
                </a>
              </div>
            ))
          )}
        </div>
      )}

      {/* Comments Tab */}
      {tab === "comments" && (
        <div className="max-w-2xl space-y-4">
          <div className="card p-4">
            <label className="label">Add Internal Comment</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="input"
              rows={3}
              placeholder="Leave an internal note (only visible to admins)..."
            />
            <button
              className="btn-primary mt-2 text-sm"
              onClick={handleAddComment}
              disabled={!comment.trim()}
            >
              Add Comment
            </button>
          </div>

          <div className="space-y-3">
            {candidate.comments?.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-4">
                No comments yet
              </div>
            ) : (
              candidate.comments?.map((c: any) => (
                <div key={c.id} className="card p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-700">
                        {c.admin?.name?.[0]?.toUpperCase() || "A"}
                      </div>
                      <span className="text-sm font-medium">
                        {c.admin?.name || "Admin"}
                      </span>
                      <span className="text-xs text-gray-400">
                        {format(new Date(c.createdAt), "PPpp")}
                      </span>
                    </div>
                    {c.admin?.id === admin?.id && (
                      <button
                        onClick={() => handleDeleteComment(c.id)}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {c.text}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
