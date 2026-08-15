"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Search, Wallet, Plus, Minus, Coins, RefreshCw, AlertCircle, Eye } from "lucide-react";
import { getUsers } from "@/services/users";
import { getWallet, getWalletBatch, adjustWallet as adjustWalletApi, type WalletData } from "@/services/wallet";
import { exportTableData } from "@/lib/exportUtils";
import { useNotification } from "@/components/Notification";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import StatCard from "@/components/StatCard";
import PageHeader from "@/components/ui/PageHeader";
import Drawer from "@/components/ui/Drawer";
import EmptyState from "@/components/ui/EmptyState";
import type { User } from "@/types";

const PAGE_SIZE = 15;

interface WalletUser extends User {
  wallet?: WalletData;
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-border py-2.5 last:border-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground break-words">{children}</dd>
    </div>
  );
}

export default function WalletsPage() {
  const { notify } = useNotification();
  const [users, setUsers] = useState<WalletUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [balanceOnly, setBalanceOnly] = useState(false);

  const [detailUser, setDetailUser] = useState<WalletUser | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<WalletUser | null>(null);
  const [adjustWallet, setAdjustWallet] = useState<WalletData | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getUsers({ page, limit: PAGE_SIZE, search: search || undefined });
      const ids = res.data.map((u) => u.id);
      const walletMap = await getWalletBatch(ids);
      const usersWithWallet: WalletUser[] = res.data.map((u) => ({
        ...u,
        wallet: walletMap[u.id],
      }));
      setUsers(usersWithWallet);
      setTotalPages(res.pagination.totalPages);
      setTotalRecords(res.pagination.total);
      setHasNext(res.pagination.hasNext);
      setHasPrev(res.pagination.hasPrev);
    } catch {
      setError("Failed to load wallets");
      setUsers([]);
      notify("error", "Failed to load wallets");
    } finally {
      setLoading(false);
    }
  }, [page, search, notify]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const displayedUsers = useMemo(
    () => (balanceOnly ? users.filter((u) => (u.wallet?.palPoints ?? 0) > 0) : users),
    [users, balanceOnly],
  );

  const totalPalPoints = useMemo(
    () => displayedUsers.reduce((sum, u) => sum + (u.wallet?.palPoints || 0), 0),
    [displayedUsers],
  );

  const handleOpenAdjust = async (user: WalletUser) => {
    setAdjustTarget(user);
    setAdjustOpen(true);
    setAdjustAmount("");
    setAdjustReason("");
    const wallet = await getWallet(user.id);
    setAdjustWallet(wallet);
  };

  const handleAdjust = async () => {
    if (!adjustTarget) return;
    const amount = parseInt(adjustAmount, 10);
    if (isNaN(amount) || amount === 0) {
      notify("error", "Please enter a valid non-zero amount");
      return;
    }
    if (!adjustReason.trim()) {
      notify("error", "Please provide a reason");
      return;
    }
    setAdjusting(true);
    try {
      await adjustWalletApi(adjustTarget.id, amount, adjustReason.trim());
      notify("success", "Wallet adjusted successfully");
      setAdjustOpen(false);
      setAdjustTarget(null);
      setAdjustWallet(null);
      void fetchUsers();
    } catch {
      notify("error", "Failed to adjust wallet");
    } finally {
      setAdjusting(false);
    }
  };

  const openDetail = (user: WalletUser) => {
    setDetailUser(user);
  };

  const columns: Column<WalletUser & Record<string, unknown>>[] = useMemo(
    () => [
      {
        key: "name",
        header: "User",
        render: (item) => (
          <button
            type="button"
            onClick={() => openDetail(item as WalletUser)}
            className="text-left hover:text-primary hover:underline"
          >
            <p className="font-medium">{item.name || "Unnamed"}</p>
            <p className="text-xs text-muted-foreground">{item.email}</p>
          </button>
        ),
        exportValue: (item) => `${item.name || "Unnamed"} (${item.email})`,
      },
      {
        key: "palPoints",
        header: "Pal Points",
        render: (item) => (
          <span className="font-semibold text-emerald-600">
            {item.wallet?.palPoints ?? "—"}
          </span>
        ),
        exportValue: (item) => item.wallet?.palPoints ?? 0,
      },
      {
        key: "lifetimeEarned",
        header: "Lifetime Earned",
        exportValue: (item) => item.wallet?.lifetimeEarned ?? 0,
        render: (item) => item.wallet?.lifetimeEarned ?? "—",
      },
      {
        key: "lifetimeSpent",
        header: "Lifetime Spent",
        exportValue: (item) => item.wallet?.lifetimeSpent ?? 0,
        render: (item) => item.wallet?.lifetimeSpent ?? "—",
      },
      {
        key: "actions",
        header: "Actions",
        render: (item) => (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => openDetail(item as WalletUser)}
              className="rounded p-1.5 text-primary hover:bg-muted"
              title="View details"
              aria-label="View wallet details"
            >
              <Eye size={16} />
            </button>
            <button
              type="button"
              onClick={() => handleOpenAdjust(item as WalletUser)}
              className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100"
            >
              Adjust
            </button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Wallets"
        description="Manage user wallet balances, PalPoints, and manual adjustments."
        icon={Wallet}
        actions={
          <button type="button" onClick={() => void fetchUsers()} className="admin-btn-secondary">
            <RefreshCw size={16} /> Refresh
          </button>
        }
      />

      {error && !loading && (
        <EmptyState
          icon={AlertCircle}
          title="Could not load wallets"
          description={error}
          action={
            <button type="button" onClick={() => void fetchUsers()} className="admin-btn-primary">
              Retry
            </button>
          }
        />
      )}

      {!error && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard title="Users on Page" value={displayedUsers.length} icon={Wallet} color="blue" />
            <StatCard
              title="Pal Points (Page)"
              value={totalPalPoints.toLocaleString()}
              icon={Coins}
              color="emerald"
            />
            <StatCard title="Total Users" value={totalRecords} icon={Wallet} color="purple" />
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1 max-w-md">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search users by name or email..."
                className="admin-input pl-10"
                aria-label="Search wallets"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={balanceOnly}
                onChange={(e) => setBalanceOnly(e.target.checked)}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              Balance &gt; 0 only
              <span className="ml-1 text-xs text-muted-foreground">(this page)</span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!displayedUsers.length}
                onClick={() =>
                  exportTableData(columns, displayedUsers as (WalletUser & Record<string, unknown>)[], "wallets", "csv")
                }
                className="admin-btn-secondary py-1.5 text-xs disabled:opacity-50"
              >
                Export CSV
              </button>
              <button
                type="button"
                disabled={!displayedUsers.length}
                onClick={() =>
                  exportTableData(columns, displayedUsers as (WalletUser & Record<string, unknown>)[], "wallets", "excel")
                }
                className="admin-btn-secondary py-1.5 text-xs disabled:opacity-50"
              >
                Export Excel
              </button>
            </div>
          </div>

          {!loading && displayedUsers.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No wallets found"
              description={
                balanceOnly
                  ? "No users with a positive balance on this page. Try another page or clear the filter."
                  : "Try adjusting your search or check back later."
              }
            />
          ) : (
            <DataTable
              columns={columns}
              data={displayedUsers as (WalletUser & Record<string, unknown>)[]}
              loading={loading}
              page={page}
              totalPages={totalPages}
              totalRecords={balanceOnly ? displayedUsers.length : totalRecords}
              hasNext={hasNext}
              hasPrev={hasPrev}
              onPageChange={setPage}
              emptyMessage="No users found"
              exportFilename="wallets-export"
              showFirstLast
            />
          )}
        </>
      )}

      <Drawer
        open={!!detailUser}
        onClose={() => setDetailUser(null)}
        title="Wallet Details"
        width="max-w-lg"
      >
        {detailUser && (
          <div className="space-y-4">
            <dl>
              <FieldRow label="Name">{detailUser.name || "Unnamed"}</FieldRow>
              <FieldRow label="Email">{detailUser.email}</FieldRow>
              <FieldRow label="User ID">
                <span className="font-mono text-xs">{detailUser.id}</span>
              </FieldRow>
              <FieldRow label="Pal Points">
                <span className="text-lg font-bold text-emerald-600">
                  {detailUser.wallet?.palPoints ?? "—"}
                </span>
              </FieldRow>
              <FieldRow label="Lifetime Earned">{detailUser.wallet?.lifetimeEarned ?? "—"}</FieldRow>
              <FieldRow label="Lifetime Spent">{detailUser.wallet?.lifetimeSpent ?? "—"}</FieldRow>
            </dl>
            <button
              type="button"
              onClick={() => {
                setDetailUser(null);
                void handleOpenAdjust(detailUser);
              }}
              className="admin-btn-primary w-full"
            >
              Adjust Balance
            </button>
          </div>
        )}
      </Drawer>

      <Drawer
        open={adjustOpen}
        onClose={() => {
          setAdjustOpen(false);
          setAdjustTarget(null);
          setAdjustWallet(null);
        }}
        title="Adjust Wallet"
        width="max-w-md"
      >
        {adjustTarget && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {adjustTarget.name || adjustTarget.email}
            </p>

            {adjustWallet && (
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-4">
                <div>
                  <p className="text-xs text-muted-foreground">Current Points</p>
                  <p className="text-lg font-bold text-emerald-600">{adjustWallet.palPoints}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Lifetime Earned</p>
                  <p className="text-lg font-bold">{adjustWallet.lifetimeEarned}</p>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="adjust-amount" className="mb-1 block text-sm font-medium">
                Amount (+ to add, − to subtract)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {adjustAmount.startsWith("-") ? <Minus size={16} /> : <Plus size={16} />}
                </span>
                <input
                  id="adjust-amount"
                  type="number"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  placeholder="e.g. 100 or -50"
                  className="admin-input pl-10"
                />
              </div>
            </div>
            <div>
              <label htmlFor="adjust-reason" className="mb-1 block text-sm font-medium">
                Reason
              </label>
              <input
                id="adjust-reason"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="e.g. Bonus for contribution"
                className="admin-input"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setAdjustOpen(false);
                  setAdjustTarget(null);
                }}
                className="admin-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleAdjust()}
                disabled={adjusting}
                className="admin-btn-primary disabled:opacity-50"
              >
                {adjusting ? "Adjusting…" : "Adjust"}
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
