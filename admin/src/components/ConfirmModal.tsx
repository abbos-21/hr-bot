import React from 'react';
import { useT } from '../i18n';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title, message, confirmLabel, cancelLabel, danger = false, onConfirm, onCancel,
}) => {
  const { t } = useT();
  return (
  <div className="fixed inset-0 z-[300] bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
      <h3 className="text-base font-bold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 mb-6 leading-relaxed">{message}</p>
      <div className="flex gap-3 justify-end">
        <button onClick={onCancel}
          className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
          {cancelLabel || t("confirm.cancel")}
        </button>
        <button onClick={onConfirm}
          className={`px-4 py-2 text-sm font-semibold text-white rounded-xl transition-colors ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'}`}>
          {confirmLabel || t("confirm.confirm")}
        </button>
      </div>
    </div>
  </div>
  );
};

// Hook for imperative usage
export function useConfirm() {
  const [modal, setModal] = React.useState<{
    title: string; message: string; danger?: boolean; confirmLabel?: string;
    onConfirm: () => void; onCancel: () => void;
  } | null>(null);

  const confirm = (opts: { title: string; message: string; danger?: boolean; confirmLabel?: string }) =>
    new Promise<boolean>(resolve => {
      setModal({
        ...opts,
        onConfirm: () => { setModal(null); resolve(true); },
        onCancel:  () => { setModal(null); resolve(false); },
      });
    });

  const element = modal ? (
    <ConfirmModal
      title={modal.title}
      message={modal.message}
      danger={modal.danger}
      confirmLabel={modal.confirmLabel}
      onConfirm={modal.onConfirm}
      onCancel={modal.onCancel}
    />
  ) : null;

  return { confirm, element };
}
