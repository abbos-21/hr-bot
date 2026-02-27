import React, { useEffect, useState, useRef } from "react";
import { candidatesApi, messagesApi, filesApi } from "../api";
import { format } from "date-fns";
import { useAuthStore } from "../store/auth";
import { useWebSocket } from "../hooks/useWebSocket";
import toast from "react-hot-toast";

export const HiredCandidatesPage: React.FC = () => {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    candidatesApi
      .list({ status: "hired", limit: 500, page: 1 })
      .then((r) => setCandidates(r.candidates || []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = candidates.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.fullName || "").toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.username || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">✅ Hired</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {candidates.length} hired candidates
          </p>
        </div>
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-52 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
        />
      </div>

      {loading ? (
        <p className="text-gray-400 text-center py-12">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-sm font-medium">No hired candidates yet</p>
        </div>
      ) : (
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
                  Contact
                </th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">
                  Hired
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold">
                        {(
                          (c.fullName || c.username || "?")[0] || "?"
                        ).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {c.fullName || c.username || "Unknown"}
                        </p>
                        {c.username && (
                          <p className="text-xs text-gray-400">@{c.username}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.job?.translations?.[0]?.title || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {c.phone || c.email || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {format(new Date(c.updatedAt), "MMM d, yyyy")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && (
        <MiniPanel
          candidateId={selectedId}
          onClose={() => setSelectedId(null)}
          onRestore={(id) => {
            setCandidates((prev) => prev.filter((c) => c.id !== id));
            setSelectedId(null);
          }}
        />
      )}
    </div>
  );
};

// ─── Mini detail panel ────────────────────────────────────────────────────────

const MiniPanel: React.FC<{
  candidateId: string;
  onClose: () => void;
  onRestore: (id: string) => void;
}> = ({ candidateId, onClose, onRestore }) => {
  const [candidate, setCandidate] = useState<any>(null);

  useEffect(() => {
    candidatesApi.get(candidateId).then(setCandidate);
  }, [candidateId]);

  const handleRestore = async () => {
    if (!candidate) return;
    await candidatesApi.update(candidate.id, { status: "active" });
    toast.success("Restored to pipeline");
    onRestore(candidate.id);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/10 z-30" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-40 flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">
            {candidate?.fullName || candidate?.username || "…"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ×
          </button>
        </div>
        {candidate && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">Job</p>
              <p className="text-sm font-medium">
                {candidate.job?.translations?.[0]?.title || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Contact</p>
              <p className="text-sm font-medium">
                {candidate.phone || candidate.email || "—"}
              </p>
            </div>
            {candidate.answers?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Answers
                </p>
                {candidate.answers.map((a: any) => (
                  <div key={a.id} className="mb-2">
                    <p className="text-xs text-gray-400">
                      {a.question?.translations?.[0]?.text}
                    </p>
                    <p className="text-sm font-medium text-gray-800">
                      {a.option?.translations?.[0]?.text || a.textValue || "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={handleRestore}
            className="w-full py-2.5 border border-blue-200 text-blue-600 hover:bg-blue-50 font-semibold rounded-xl transition-colors text-sm"
          >
            ↩ Move Back to Pipeline
          </button>
        </div>
      </div>
    </>
  );
};
