"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { forgotPassword, verifyResetOtp, resetPassword } from "@/services/auth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$/;

type Step = "email" | "code" | "password" | "success";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resetSessionToken, setResetSessionToken] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!EMAIL_REGEX.test(email.trim())) {
      setError("Enter a valid email address");
      return;
    }
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setStep("code");
      setInfo(
        "Check your inbox and spam folder. Codes expire in 15 minutes.",
      );
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Could not send verification code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (code.trim().length < 8) {
      setError("Enter the full 8-character verification code");
      return;
    }
    setLoading(true);
    try {
      const sessionToken = await verifyResetOtp(email, code);
      setResetSessionToken(sessionToken);
      setStep("password");
      setInfo("Code verified. Choose your new password.");
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Invalid or expired verification code");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    if (!PASSWORD_REGEX.test(password)) {
      setError("Password must be 8+ chars with uppercase, lowercase, number, and special character (@$!%*?&)");
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email, resetSessionToken, password);
      setStep("success");
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Could not reset password");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = (e: React.MouseEvent) => {
    if (step === "password") {
      e.preventDefault();
      setStep("code");
      setPassword("");
      setError("");
      setInfo("");
      return;
    }
    if (step === "code") {
      e.preventDefault();
      setStep("email");
      setCode("");
      setPassword("");
      setError("");
      setInfo("");
    }
  };

  const title =
    step === "success"
      ? "Password updated"
      : step === "password"
        ? "Set new password"
        : step === "code"
          ? "Verify code"
          : "Forgot password";

  const subtitle =
    step === "success"
      ? "You can now sign in with your new password."
      : step === "password"
        ? "Your verification code is confirmed. Enter a secure new password."
        : step === "code"
          ? `Enter the 8-character code sent to ${email}.`
          : "We'll email you an 8-character verification code.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6">
          <Link
            href={step === "success" || step === "email" ? "/login" : "#"}
            onClick={handleBack}
            className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
          >
            <ArrowLeft size={16} />
            {step === "success"
              ? "Back to sign in"
              : step === "password"
                ? "Back to verification"
                : step === "code"
                  ? "Change email"
                  : "Back to sign in"}
          </Link>
        </div>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            {step === "password" ? <ShieldCheck size={28} /> : <KeyRound size={28} />}
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
        </div>

        {step === "success" ? (
          <Link
            href="/login"
            className="flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Back to sign in
          </Link>
        ) : step === "email" ? (
          <form onSubmit={handleSendCode} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                />
              </div>
            </div>
            {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {loading ? "Sending…" : "Send verification code"}
            </button>
          </form>
        ) : step === "code" ? (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Verification code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={8}
                required
                autoFocus
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm uppercase tracking-widest outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
              />
            </div>
            {info && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>}
            {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {loading ? "Verifying…" : "Verify code"}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={async () => {
                setError("");
                setInfo("");
                setLoading(true);
                try {
                  await forgotPassword(email.trim());
                  setInfo("A new code was sent. Check inbox and spam — codes expire in 15 minutes.");
                } catch (err: any) {
                  setError(err?.response?.data?.message || err?.message || "Could not resend code");
                } finally {
                  setLoading(false);
                }
              }}
              className="w-full rounded-lg border border-emerald-200 px-4 py-2.5 text-sm font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
            >
              Resend code
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">New password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 pr-10 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {info && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>}
            {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {loading ? "Updating…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
