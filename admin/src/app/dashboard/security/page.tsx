"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  KeyRound, Lock, ScrollText, Shield, ShieldCheck, Users,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { getAdminRoleFromStorage, getRoleLabel } from "@/lib/permissions";
import { getAuditLogs } from "@/services/audit";

export default function SecurityPage() {
  const [role, setRole] = useState("");
  const [recentLogins, setRecentLogins] = useState(0);

  useEffect(() => {
    const r = getAdminRoleFromStorage();
    if (r) setRole(getRoleLabel(r));

    getAuditLogs({ limit: 50, action: "LOGIN", sortOrder: "desc" })
      .then((res) => setRecentLogins(res.data?.length ?? 0))
      .catch(() => setRecentLogins(0));
  }, []);

  const sections = [
    {
      title: "Roles & permissions",
      description: "Manage admin roles and who can access each module in the sidebar.",
      href: "/dashboard/roles",
      icon: ShieldCheck,
    },
    {
      title: "Audit logs",
      description: "Every admin action with timestamps, IP, and before/after snapshots.",
      href: "/dashboard/audit-logs",
      icon: ScrollText,
    },
    {
      title: "Settings — security",
      description: "Maintenance mode, rate limits, and platform security configuration.",
      href: "/dashboard/settings",
      icon: Lock,
    },
    {
      title: "User access",
      description: "Ban, suspend, or review user accounts and reported activity.",
      href: "/dashboard/users",
      icon: Users,
    },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Security"
        description="Sessions, permissions, audit trail, and platform security controls."
        icon={Shield}
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="admin-card p-5">
          <p className="text-sm text-muted-foreground">Your role</p>
          <p className="mt-2 text-lg font-semibold">{role || "Admin"}</p>
        </div>
        <div className="admin-card p-5">
          <p className="text-sm text-muted-foreground">Recent login events (last 50)</p>
          <p className="mt-2 text-lg font-semibold tabular-nums">{recentLogins}</p>
        </div>
        <div className="admin-card p-5">
          <p className="text-sm text-muted-foreground">Auth method</p>
          <p className="mt-2 flex items-center gap-2 text-lg font-semibold">
            <KeyRound size={18} className="text-primary" />
            JWT + HttpOnly cookie
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="admin-card group flex gap-4 p-5 transition hover:border-primary/30 hover:shadow-md"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
              <section.icon size={20} />
            </span>
            <div>
              <h2 className="font-semibold">{section.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-8 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">Auth status:</strong> Admin sessions use JWT in HttpOnly cookies
        with silent refresh. Privileged actions are recorded in Audit Logs. Two-factor authentication and a
        dedicated failed-login dashboard are planned — use Audit Logs and Settings for current controls.
      </div>
    </div>
  );
}
