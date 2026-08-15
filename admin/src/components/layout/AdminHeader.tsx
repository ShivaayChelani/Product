"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell, ChevronDown, LogOut, Moon, Search, Settings, Shield, Sun, User,
} from "lucide-react";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import GlobalSearch from "@/components/GlobalSearch";
import { useTheme } from "@/components/ThemeProvider";
import { getAdminRoleFromStorage, getRoleLabel } from "@/lib/permissions";

export default function AdminHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [userName, setUserName] = useState("Admin");
  const [userRole, setUserRole] = useState("");
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "null");
      if (user?.name) setUserName(user.name);
      const role = getAdminRoleFromStorage();
      if (role) setUserRole(getRoleLabel(role));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("user");
    void fetch("/api/auth/logout", { method: "POST", credentials: "include" }).finally(() => {
      router.push("/login");
    });
  };

  return (
    <>
      <GlobalSearch />
      <header className="sticky top-0 z-30 border-b border-border bg-[var(--header)] backdrop-blur-md">
        <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
          <div className="min-w-0 flex-1">
            <Breadcrumbs pathname={pathname} />
          </div>

          <button
            type="button"
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))}
            className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition hover:border-primary/30 hover:text-foreground sm:flex"
            aria-label="Open global search"
          >
            <Search size={15} />
            <span>Search</span>
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium">Ctrl K</kbd>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:text-foreground"
            aria-label={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {resolvedTheme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <Link
            href="/dashboard/notifications"
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition hover:text-foreground"
            aria-label="Notifications"
          >
            <Bell size={17} />
          </Link>

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-border bg-card py-1.5 pl-1.5 pr-2.5 transition hover:border-primary/30"
              aria-expanded={profileOpen}
              aria-haspopup="menu"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <User size={15} />
              </span>
              <span className="hidden max-w-[120px] truncate text-left text-sm font-medium lg:block">
                {userName}
              </span>
              <ChevronDown size={14} className="text-muted-foreground" />
            </button>

            {profileOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-56 animate-fade-in rounded-xl border border-border bg-card py-1 shadow-lg"
              >
                <div className="border-b border-border px-4 py-3">
                  <p className="truncate text-sm font-semibold">{userName}</p>
                  {userRole && <p className="text-xs text-muted-foreground">{userRole}</p>}
                </div>
                <Link
                  href="/dashboard/settings"
                  role="menuitem"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm transition hover:bg-muted"
                  onClick={() => setProfileOpen(false)}
                >
                  <Settings size={15} /> Settings
                </Link>
                <Link
                  href="/dashboard/security"
                  role="menuitem"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm transition hover:bg-muted"
                  onClick={() => setProfileOpen(false)}
                >
                  <Shield size={15} /> Security
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-destructive transition hover:bg-muted"
                >
                  <LogOut size={15} /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
