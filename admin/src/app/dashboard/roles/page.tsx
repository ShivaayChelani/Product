"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getRoles, type Role } from "@/services/roles";
import { useNotification } from "@/components/Notification";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";

export default function RolesPermissionsPage() {
  const { notify } = useNotification();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRoles()
      .then(setRoles)
      .catch(() => notify("error", "Failed to load roles"))
      .finally(() => setLoading(false));
  }, [notify]);

  const columns: Column<Role & Record<string, unknown>>[] = [
    { key: "name", header: "Role" },
    { key: "description", header: "Description" },
    { key: "userCount", header: "Users", sortable: true },
    {
      key: "isSystem",
      header: "Type",
      render: (item) => (item.isSystem ? "System" : "Custom"),
    },
    {
      key: "actions",
      header: "Manage",
      render: (item) => (
        <Link href={`/dashboard/users?permission=${item.id}`} className="text-sm font-medium text-emerald-600 hover:underline">
          View users
        </Link>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Roles & Permissions</h1>
        <p className="mt-1 text-sm text-gray-500">PalSafar admin roles. Assign roles via the Users module.</p>
      </div>

      <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50 p-4 flex gap-3">
        <ShieldCheck className="text-blue-600 shrink-0" size={20} />
        <p className="text-sm text-blue-800">
          Roles are enforced via JWT permissions and sidebar access. To change a user&apos;s role, open{" "}
          <Link href="/dashboard/users" className="font-semibold underline">Users</Link> and update their permission.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={roles as (Role & Record<string, unknown>)[]}
        loading={loading}
        emptyMessage="No roles found"
        exportFilename="admin-roles"
      />
    </div>
  );
}
