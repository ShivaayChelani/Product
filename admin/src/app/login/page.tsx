"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/services/auth";
import { isAdminUser } from "@/lib/api";
import { Eye, EyeOff, LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("error") === "session") {
      setError("Could not verify your session. Sign in again.");
    }
  }, []);

  const finishLogin = (user: Parameters<typeof isAdminUser>[0]) => {
    if (!isAdminUser(user)) {
      setError("This account is not an admin.");
      return;
    }
    localStorage.setItem("user", JSON.stringify(user));
    router.replace("/dashboard");
  };

  const apiErrorMessage = (err: any, fallback: string) => {
    const status = err?.response?.status;
    if (status === 503 || status === 502 || status === 504) {
      return err?.response?.data?.message || "Cannot reach the PalSafar API. The server may still be waking up — try again in a moment.";
    }
    if (status === 429) {
      return err?.response?.data?.message || "Too many attempts. Wait a few minutes, then try again.";
    }
    if (status === 500) {
      return err?.response?.data?.message || "PalSafar API error during sign-in. If a deploy just finished, retry in 1–2 minutes.";
    }
    return err?.response?.data?.message || err?.message || fallback;
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { user } = await login(normalizedEmail, password);
      finishLogin(user);
    } catch (err: any) {
      setError(apiErrorMessage(err, "Invalid email or password"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <img
            src="/logo.jpeg"
            alt="PalSafar Logo"
            className="mx-auto mb-3 h-16 w-16 rounded-2xl object-cover shadow-md"
          />
          <h1 className="text-2xl font-bold text-gray-900">PalSafar Admin</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to the control center</p>
        </div>

        <form onSubmit={handlePasswordSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 pr-10 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <a href="/login/forgot-password" className="text-sm font-medium text-emerald-700 hover:text-emerald-800">
              Forgot password?
            </a>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <LogIn size={18} />
            )}
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
