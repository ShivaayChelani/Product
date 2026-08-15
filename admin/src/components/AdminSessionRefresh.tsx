"use client";

import { useEffect } from "react";
import { refreshSession } from "@/services/auth";

/** Silently refresh admin session every 45 minutes while dashboard is open. */
export default function AdminSessionRefresh() {
  useEffect(() => {
    const id = setInterval(() => {
      void refreshSession().catch(() => {});
    }, 45 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return null;
}
