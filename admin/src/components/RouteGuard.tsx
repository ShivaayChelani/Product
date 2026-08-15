"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { canAccessRoute, getAdminRoleFromStorage } from "@/lib/permissions";

export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    setAllowed(false);
    const role = getAdminRoleFromStorage();
    if (!role) {
      router.replace("/login?error=session");
      return;
    }
    if (!canAccessRoute(role, pathname)) {
      router.replace("/dashboard?error=access_denied");
      return;
    }
    setAllowed(true);
  }, [pathname, router]);

  if (!allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Checking access">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
