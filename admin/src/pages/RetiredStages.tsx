import React, { useEffect, useState } from "react";
import { useConfirm } from "../components/ConfirmModal";
import { columnsApi } from "../api";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { useT } from "../i18n";

export const RetiredStagesPage: React.FC = () => {
  const { t } = useT();
  const [columns, setColumns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { confirm, element: confirmElement } = useConfirm();

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
      toast.success(t("retiredStages.restored", { name: col.name }));
    } catch {
      toast.error(t("retiredStages.failedToRestore"));
    }
  };

  const handleDelete = async (col: any) => {
    const ok = await confirm({
      title: t("retiredStages.deleteTitle", { name: col.name }),
      message: t("retiredStages.deleteMsg"),
      danger: true,
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    try {
      await columnsApi.delete(col.id);
      setColumns((prev) => prev.filter((c) => c.id !== col.id));
      toast.success(t("retiredStages.deleted", { name: col.name }));
    } catch {
      toast.error(t("retiredStages.failedToDelete"));
    }
  };

  return (
    <>
      {confirmElement}
      <div className="overflow-auto flex-1 p-4 sm:p-6 md:p-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">{t("retiredStages.title")}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {t("retiredStages.subtitle", { count: columns.length })}
          </p>
        </div>

        {loading ? (
          <p className="text-gray-400 text-center py-12">{t("common.loading")}</p>
        ) : columns.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-3">📦</p>
            <p className="text-sm font-medium">{t("retiredStages.noRetiredYet")}</p>
            <p className="text-xs mt-1">
              {t("retiredStages.noRetiredDesc")}
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
                    {t("retiredStages.archived", { date: format(new Date(col.updatedAt), "MMM d, yyyy") })}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleRestore(col)}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {t("pipeline.restoreStage")}
                    </button>
                    <button
                      onClick={() => handleDelete(col)}
                      className="text-xs font-semibold text-red-400 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      {t("common.delete")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};
