"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { useMemo } from "react";

const LABEL_MAP: Record<string, string> = {
  dashboard: "Dashboard",
  places: "Places",
  categories: "Categories",
  "hidden-gems": "Hidden Gems",
  reviews: "Reviews",
  users: "Users",
  creators: "Creators",
  vendors: "Vendors",
  wallets: "Wallet",
  palpoints: "PalPoints",
  rewards: "Rewards",
  campaigns: "Campaigns",
  analytics: "Analytics",
  reports: "Reports",
  media: "Media",
  notifications: "Notifications",
  "database-health": "Database Management",
  "api-monitor": "API Monitor",
  "audit-logs": "Audit Logs",
  sync: "Backups & Sync",
  settings: "Settings",
  security: "Security",
  roles: "Roles",
  canonical: "Canonical Places",
  moderation: "Moderation",
  offers: "Offers",
  search: "Search",
  tags: "Tags",
  reels: "Reels",
  trips: "Trips",
  legal: "Legal",
  announcements: "Announcements",
  monetization: "Monetization",
  plans: "Plans",
  coupons: "Coupons",
  transactions: "Transactions",
  revenue: "Revenue",
  "point-rules": "Point Rules",
  "riddle-hunt": "Riddle Hunt",
};

function segmentLabel(segment: string): string {
  return LABEL_MAP[segment] || segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Breadcrumbs({ pathname }: { pathname: string }) {
  const crumbs = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    if (parts[0] !== "dashboard") return [];
    const trail = (parts || []).slice(1).map((segment, index) => {
      const href = `/dashboard/${(parts || []).slice(1, index + 2).join("/")}`;
      return { href, label: segmentLabel(segment) };
    });
    return [{ href: "/dashboard", label: "Dashboard" }, ...trail];
  }, [pathname]);

  if (crumbs.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-sm text-muted-foreground md:flex">
      <Link
        href="/dashboard"
        className="flex shrink-0 items-center rounded-md p-1 transition hover:bg-muted hover:text-foreground"
        aria-label="Dashboard home"
      >
        <Home size={14} />
      </Link>
      {(crumbs || []).slice(1).map((crumb, i) => {
        const isLast = i === (crumbs || []).length - 2;
        return (
          <span key={crumb.href} className="flex min-w-0 items-center gap-1">
            <ChevronRight size={14} className="shrink-0 opacity-50" aria-hidden />
            {isLast ? (
              <span className="truncate font-medium text-foreground" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <Link href={crumb.href} className="truncate transition hover:text-foreground">
                {crumb.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
