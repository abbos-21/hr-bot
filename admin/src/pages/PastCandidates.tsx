import React, { useEffect, useState } from "react";
import { candidatesApi } from "../api";
import { format } from "date-fns";
import toast from "react-hot-toast";

export const PastCandidatesPage: React.FC = () => {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchArchived = () => {
    setLoading(true);
    candidatesApi
      .list({ status: "archived", limit: 500, page: 1 })
      .then((r) => setCandidates(r.candidates || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchArchived();
  }, []);

  const handleRestore = async (candidate: any) => {
    setRestoring(candidate.id);
    try {
      await candidatesApi.update(candidate.id, { status: "active" });
      setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
      toast.success(
        `${candidate.fullName || candidate.username || "Candidate"} restored to pipeline`,
      );
    } catch {
      toast.error("Failed to restore");
    }
    setRestoring(null);
  };

  const handleDelete = async (candidate: any) => {
    const name = candidate.fullName || candidate.username || "This candidate";
    if (!confirm(`Permanently delete ${name}? This cannot be undone.`)) return;
    setDeleting(candidate.id);
    try {
      await candidatesApi.delete(candidate.id);
      setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
      toast.success(`${name} permanently deleted`);
    } catch {
      toast.error("Failed to delete");
    }
    setDeleting(null);
  };

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
          <h1 className="text-xl font-bold text-gray-900">
            🗃 Past Candidates
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {candidates.length} archived · restore them to the active pipeline
            anytime
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
          <p className="text-4xl mb-3">🗃</p>
          <p className="text-sm font-medium">
            {search ? "No matches" : "No archived candidates"}
          </p>
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
                  Archived
                </th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-bold">
                        {(
                          (c.fullName || c.username || "?")[0] || "?"
                        ).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-700">
                          {c.fullName || c.username || "Unknown"}
                        </p>
                        {c.username && (
                          <p className="text-xs text-gray-400">@{c.username}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {c.job?.translations?.[0]?.title || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {c.phone || c.email || "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {format(new Date(c.updatedAt), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRestore(c)}
                        disabled={restoring === c.id || deleting === c.id}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                      >
                        {restoring === c.id ? "Restoring…" : "↩ Restore"}
                      </button>
                      <button
                        onClick={() => handleDelete(c)}
                        disabled={deleting === c.id || restoring === c.id}
                        className="text-xs font-semibold text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
                      >
                        {deleting === c.id ? "Deleting…" : "🗑 Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
