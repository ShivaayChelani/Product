"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import AdminHeader from "@/components/layout/AdminHeader";
import { NotificationProvider } from "@/components/Notification";
import ErrorBoundary from "@/components/ErrorBoundary";
import RouteGuard from "@/components/RouteGuard";
import AdminSessionRefresh from "@/components/AdminSessionRefresh";
import { getMe } from "@/services/auth";
import { isAdminUser } from "@/lib/api";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [bootError, setBootError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Session is the HttpOnly cookie; getMe goes through /api/proxy.
        // Run once per layout mount — do not re-verify on every tab navigation.
        const user = await getMe();
        if (cancelled) return;
        if (isAdminUser(user)) {
          localStorage.setItem("user", JSON.stringify(user));
          setMounted(true);
          return;
        }
        localStorage.removeItem("user");
        router.replace("/login");
      } catch (err: any) {
        if (cancelled) return;
        const status = err?.response?.status ?? err?.status;
        const msg = err?.response?.data?.message || err?.message || "Could not verify admin session.";

        if (status === 429) {
          setBootError(msg);
          return;
        }

        // Only force login when the session is actually invalid/unauthorized.
        // Network/5xx/other errors should not wipe a working login.
        if (status === 401 || status === 403) {
          localStorage.removeItem("user");
          router.replace("/login");
          return;
        }

        setBootError(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- verify session once on mount only
  }, []);

  if (bootError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm font-medium text-red-600">{bootError}</p>
        <button
          type="button"
          onClick={() => {
            setBootError("");
            window.location.reload();
          }}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <AdminSessionRefresh />
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader />
        <main className="min-w-0 flex-1 overflow-auto p-4 pb-12 pt-14 lg:p-8 lg:pt-8">
          <NotificationProvider>
            <ErrorBoundary>
              <RouteGuard>{children}</RouteGuard>
            </ErrorBoundary>
          </NotificationProvider>
        </main>
      </div>
    </div>
  );
}
