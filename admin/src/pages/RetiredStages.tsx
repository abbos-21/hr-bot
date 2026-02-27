import React, { useEffect, useState } from "react";
import { columnsApi } from "../api";
import { format } from "date-fns";
import toast from "react-hot-toast";

export const RetiredStagesPage: React.FC = () => {
  const [columns, setColumns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    columnsApi
      .archived()
      .then(setColumns)
      .finally(() => setLoading(false));
  }, []);

  const handleRestore = async (col: any) => {
    try {
      await columnsApi.restore(col.id);
      setColumns((prev) => prev.filter((c) => c.id !== col.id));
      toast.success(`Stage "${col.name}" restored to pipeline`);
    } catch {
      toast.error("Failed to restore");
    }
  };

  const handleDelete = async (col: any) => {
    if (
      !confirm(`Permanently delete stage "${col.name}"? This cannot be undone.`)
    )
      return;
    try {
      await columnsApi.delete(col.id);
      setColumns((prev) => prev.filter((c) => c.id !== col.id));
      toast.success(`Stage "${col.name}" deleted`);
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">📦 Retired Stages</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          {columns.length} archived stages · restore to bring back to the
          pipeline board
        </p>
      </div>

      {loading ? (
        <p className="text-gray-400 text-center py-12">Loading…</p>
      ) : columns.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-sm font-medium">No retired stages yet</p>
          <p className="text-xs mt-1">
            Archive a stage from the Pipeline board to see it here
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
          {columns.map((col) => (
            <div
              key={col.id}
              className="bg-white rounded-2xl border border-gray-200 p-5 flex items-start gap-4"
            >
              <div
                className={`w-10 h-10 rounded-xl ${col.color} flex items-center justify-center flex-shrink-0`}
              >
                <span className={`w-3 h-3 rounded-full ${col.dot}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 truncate">
                  {col.name}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Archived {format(new Date(col.updatedAt), "MMM d, yyyy")}
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleRestore(col)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    ↩ Restore
                  </button>
                  <button
                    onClick={() => handleDelete(col)}
                    className="text-xs font-semibold text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
