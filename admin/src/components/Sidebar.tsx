"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, MapPin, Users, Video, Flag, Compass, ScrollText, LogOut, Menu, X,
  Store, Award, Tag, Wallet, Settings, Diamond, ScanLine, TrendingUp, DollarSign, Bell,
  Gift, Clapperboard, Megaphone, FolderLock, CreditCard, Receipt, BadgePercent, ImageIcon,
  ShieldCheck, Globe, Layers, Hash, Shield, Search, Sparkles, Database, Activity,
  Lock, ShieldAlert, Handshake, Smartphone
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { canAccessRoute, getAdminRoleFromStorage } from "@/lib/permissions";
import type { AdminRole } from "@/components/PermissionWrapper";

const navGroups = [
  {
    title: "OVERVIEW",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "TOURISM",
    items: [
      { href: "/dashboard/places", label: "Places", icon: MapPin },
      { href: "/dashboard/categories", label: "Categories", icon: Layers },
      { href: "/dashboard/hidden-gems", label: "Hidden Gems", icon: Diamond },
      { href: "/dashboard/canonical", label: "Canonical Places", icon: ShieldCheck },
      { href: "/dashboard/tags", label: "Tags", icon: Hash },
    ],
  },
  {
    title: "MODERATION",
    items: [
      { href: "/dashboard/reviews", label: "Reviews", icon: Flag },
      { href: "/dashboard/moderation", label: "Unified Moderation", icon: Shield },
      { href: "/dashboard/reels", label: "Reels", icon: Video },
    ],
  },
  {
    title: "USERS & BUSINESS",
    items: [
      { href: "/dashboard/users", label: "Users", icon: Users },
      { href: "/dashboard/creators", label: "Creators", icon: Clapperboard },
      { href: "/dashboard/vendors", label: "Vendors", icon: Store },
      { href: "/dashboard/collaborations", label: "Collaborations", icon: Handshake },
    ],
  },
  {
    title: "REWARDS",
    items: [
      { href: "/dashboard/rewards", label: "Rewards", icon: Gift },
      { href: "/dashboard/wallets", label: "Wallet", icon: Wallet },
      { href: "/dashboard/palpoints", label: "PalPoints", icon: Sparkles },
      { href: "/dashboard/redemptions", label: "Redemptions", icon: Receipt },
      { href: "/dashboard/fraud-detection", label: "Fraud Detection", icon: ShieldAlert },
      { href: "/dashboard/campaigns", label: "Campaigns", icon: Gift },
      { href: "/dashboard/offers", label: "Offers", icon: Tag },
      { href: "/dashboard/point-rules", label: "Point Rules", icon: Award },
    ],
  },
  {
    title: "ENGAGEMENT",
    items: [
      { href: "/dashboard/riddle-hunt", label: "Riddle Hunt", icon: Compass },
      { href: "/dashboard/trips", label: "Trips", icon: Globe },
    ],
  },
  {
    title: "MONETIZATION",
    items: [
      { href: "/dashboard/monetization/plans", label: "Subscriptions", icon: CreditCard },
      { href: "/dashboard/monetization/coupons", label: "Coupons", icon: BadgePercent },
      { href: "/dashboard/monetization/transactions", label: "Transactions", icon: Receipt },
      { href: "/dashboard/monetization/revenue", label: "Revenue", icon: DollarSign },
      { href: "/dashboard/monetization/ads", label: "AdMob", icon: Smartphone },
    ],
  },
  {
    title: "INSIGHTS",
    items: [
      { href: "/dashboard/analytics", label: "Analytics", icon: TrendingUp },
      { href: "/dashboard/reports", label: "Reports", icon: Flag },
      { href: "/dashboard/search", label: "Search Admin", icon: Search },
    ],
  },
  {
    title: "CMS & COMMS",
    items: [
      { href: "/dashboard/media", label: "Media", icon: ImageIcon },
      { href: "/dashboard/notifications", label: "Notifications", icon: Bell },
      { href: "/dashboard/legal", label: "Legal CMS", icon: FolderLock },
      { href: "/dashboard/announcements", label: "Announcements", icon: Megaphone },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { href: "/dashboard/database-health", label: "Database Management", icon: Database },
      { href: "/dashboard/api-monitor", label: "API Monitor", icon: Activity },
      { href: "/dashboard/audit-logs", label: "Audit Logs", icon: ScrollText },
      { href: "/dashboard/sync", label: "Offline Sync", icon: ScanLine },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
      { href: "/dashboard/security", label: "Security", icon: Lock },
      { href: "/dashboard/roles", label: "Roles & Permissions", icon: ShieldCheck },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userRole, setUserRole] = useState<AdminRole | null>(null);

  useEffect(() => {
    setUserRole(getAdminRoleFromStorage());
  }, []);

  const filteredGroups = useMemo(() => {
    if (!userRole) return [];
    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => canAccessRoute(userRole, item.href)),
      }))
      .filter((group) => group.items.length > 0);
  }, [userRole]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    void fetch("/api/auth/logout", { method: "POST", credentials: "include" }).finally(() => {
      router.push("/login");
    });
  };

  const nav = (
    <nav className="flex h-full flex-1 flex-col overflow-y-auto custom-scrollbar">
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/5 bg-sidebar px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-active">
          <MapPin className="text-white" size={18} />
        </div>
        <div>
          <p className="text-base font-bold leading-none tracking-tight text-white">PalSafar</p>
          <p className="mt-1 text-[10px] font-medium leading-none tracking-wider text-sidebar-foreground/70">
            Admin Console
          </p>
        </div>
      </div>
      <div className="flex-1 space-y-6 px-3 py-4">
        {filteredGroups.map((group) => (
          <div key={group.title}>
            <p className="mb-2 px-3 text-[10px] font-semibold tracking-widest text-sidebar-foreground/50">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
                      active
                        ? "bg-sidebar-active text-white shadow-md shadow-blue-600/20"
                        : "text-sidebar-foreground hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <item.icon size={17} className={active ? "text-white" : "opacity-70"} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="sticky bottom-0 mt-auto border-t border-white/5 bg-sidebar p-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition hover:bg-white/5 hover:text-white"
        >
          <LogOut size={17} />
          Logout
        </button>
      </div>
    </nav>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-md lg:hidden"
        aria-label="Open navigation menu"
      >
        <Menu size={20} />
      </button>
      <aside className="hidden h-screen w-64 shrink-0 border-r border-white/5 bg-sidebar shadow-xl lg:flex lg:flex-col">
        {nav}
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <button
            type="button"
            className="flex-1 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-label="Close navigation menu"
          />
          <aside className="relative h-screen w-72 shrink-0 bg-sidebar shadow-2xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 z-20 text-sidebar-foreground hover:text-white"
              aria-label="Close menu"
            >
              <X size={24} />
            </button>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
