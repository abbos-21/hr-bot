import React from "react";
import { useT } from "../i18n";

const STATUS_STYLES: Record<string, string> = {
  incomplete: "bg-gray-100 text-gray-700",
  applied: "bg-blue-100 text-blue-700",
  screening: "bg-yellow-100 text-yellow-700",
  interviewing: "bg-purple-100 text-purple-700",
  offered: "bg-orange-100 text-orange-700",
  hired: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  archived: "bg-gray-200 text-gray-500",
  active: "bg-blue-50 text-blue-600",
};

interface Props {
  status: string;
  className?: string;
}

export const StatusBadge: React.FC<Props> = ({ status, className = "" }) => {
  const { t } = useT();
  const style = STATUS_STYLES[status] || "bg-gray-100 text-gray-700";
  const label = t(`candidates.statuses.${status}`) || status;
  return <span className={`badge ${style} ${className}`}>{label}</span>;
};
