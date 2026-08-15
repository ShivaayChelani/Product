const styles: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
  CHANGESREQUESTED: "bg-amber-100 text-amber-800",
  RESOLVED: "bg-emerald-100 text-emerald-800",
  DISMISSED: "bg-gray-100 text-gray-600",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  INACTIVE: "bg-gray-100 text-gray-600",
  ADMIN: "bg-purple-100 text-purple-800",
  USER: "bg-blue-100 text-blue-800",
  VENDOR: "bg-cyan-100 text-cyan-800",
  CONTENTCREATOR: "bg-amber-100 text-amber-800",
  PARTNER: "bg-cyan-100 text-cyan-800",
  RETIRED: "bg-slate-200 text-slate-600",
  SUSPENDED: "bg-orange-100 text-orange-800",
  PAUSED: "bg-gray-100 text-gray-600",
};

export default function StatusBadge({
  status,
}: {
  status: string;
}) {
  const normalized = status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const s = status.replace(/_/g, '').toUpperCase();
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        styles[s] || styles[status.toUpperCase()] || "bg-gray-100 text-gray-700"
      }`}
    >
      {normalized}
    </span>
  );
}
