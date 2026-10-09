"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getRoles, type Role } from "@/services/roles";
import { useNotification } from "@/components/Notification";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import PageHeader from "@/components/ui/PageHeader";

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
        <Link href={`/dashboard/users?permission=${item.id}`} className="text-sm font-medium text-primary hover:underline">
          View users
        </Link>
      ),
    },
  ];

  return (
    <div className="admin-page">
      <PageHeader
        title="Roles & Permissions"
        description="PalSafar admin roles. Assign roles via the Users module. Server-side guards enforce every change."
        icon={ShieldCheck}
      />

      <div className="mb-6 flex gap-3 rounded-xl border border-border bg-muted/40 p-4">
        <ShieldCheck className="shrink-0 text-primary" size={20} />
        <p className="text-sm text-foreground">
          Roles are enforced via JWT permissions and sidebar access. To change a user&apos;s role, open{" "}
          <Link href="/dashboard/users" className="font-semibold text-primary underline">Users</Link> and update their permission.
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
