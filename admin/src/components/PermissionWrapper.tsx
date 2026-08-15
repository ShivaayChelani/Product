"use client";

import React, { useEffect, useState } from "react";
import { resolveAdminRole } from "@/lib/adminRoles";

export type AdminRole = 
  | "ADMIN"
  | "SUPER_ADMIN"
  | "OPS_ADMIN"
  | "VENDOR_MANAGER"
  | "CONTENT_MODERATOR"
  | "FINANCE_MANAGER"
  | "SUPPORT_AGENT"
  | "MARKETING_ADMIN"
  | "ANALYTICS_VIEWER";

interface PermissionWrapperProps {
  children: React.ReactNode;
  allowedRoles?: AdminRole[];
  fallback?: React.ReactNode;
}

export default function PermissionWrapper({ children, allowedRoles, fallback = null }: PermissionWrapperProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const userStr = localStorage.getItem("user");
      if (!userStr) {
        setHasPermission(false);
        return;
      }

      const user = JSON.parse(userStr);
      const role = resolveAdminRole(user) as AdminRole | null;
      if (!role) {
        setHasPermission(false);
        return;
      }

      if (role === "SUPER_ADMIN" || role === "ADMIN") {
        setHasPermission(true);
        return;
      }

      if (!allowedRoles || allowedRoles.length === 0) {
        setHasPermission(false);
        return;
      }

      setHasPermission(allowedRoles.includes(role));
    } catch {
      setHasPermission(false);
    }
  }, [allowedRoles]);

  if (hasPermission === null) return null;
  if (!hasPermission) return <>{fallback}</>;

  return <>{children}</>;
}
