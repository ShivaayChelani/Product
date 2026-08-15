"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Receipt, RefreshCw, AlertCircle, Eye, FileDown, Gift, Filter,
} from "lucide-react";
import { monetizationApi, type SubscriptionPlan } from "@/services/monetization";
import { exportTableData } from "@/lib/exportUtils";
import { useNotification } from "@/components/Notification";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import PageHeader from "@/components/ui/PageHeader";
import Drawer from "@/components/ui/Drawer";
import EmptyState from "@/components/ui/EmptyState";
import type { PaginatedResponse } from "@/types";

const PAGE_SIZE = 20;

interface PaymentTransaction {
  id: string;
  userId: string;
  provider: string;
  status: string;
  amountPaise: number;
  createdAt: string;
  user?: { id: string; name: string; email: string };
  invoice?: { id: string };
  subscription?: { plan?: { name: string } };
}

interface RefundRow {
  id: string;
  amountPaise: number;
  status: string;
  createdAt: string;
  transaction?: {
    id: string;
    userId: string;
    amountPaise: number;
    provider: string;
    status: string;
  };
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-2 border-b border-border py-2.5 last:border-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

function formatInr(paise: number) {
  return `₹${(paise / 100).toFixed(2)}`;
}

export default function TransactionsPage() {
  const { notify } = useNotification();
  const [rows, setRows] = useState<PaymentTransaction[]>([]);
  const [allRows, setAllRows] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);

  const [statusFilter, setStatusFilter] = useState("");
  const [providerFilter, setProviderFilter] = useState("");

  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [refundsLoading, setRefundsLoading] = useState(true);
  const [refundPage, setRefundPage] = useState(1);
  const [refundTotalPages, setRefundTotalPages] = useState(1);
  const [refundTotal, setRefundTotal] = useState(0);
  const [refundHasNext, setRefundHasNext] = useState(false);
  const [refundHasPrev, setRefundHasPrev] = useState(false);

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [detailTx, setDetailTx] = useState<PaymentTransaction | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantUserId, setGrantUserId] = useState("");
  const [grantPlanId, setGrantPlanId] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await monetizationApi.listTransactions(page, PAGE_SIZE);
      const body = res.data as PaginatedResponse<PaymentTransaction> & { data: PaymentTransaction[] };
      const data = body.data || [];
      setAllRows(data);
      const pag = body.pagination;
      setTotalPages(pag?.totalPages ?? 1);
      setTotalRecords(pag?.total ?? data.length);
      setHasNext((pag?.page ?? page) < (pag?.totalPages ?? 1));
      setHasPrev((pag?.page ?? page) > 1);
    } catch {
      setError("Failed to load transactions");
      setAllRows([]);
      notify("error", "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }, [page, notify]);

  const fetchRefunds = useCallback(async () => {
    setRefundsLoading(true);
    try {
      const res = await monetizationApi.listRefunds(refundPage);
      const body = res.data as PaginatedResponse<RefundRow> & { data: RefundRow[] };
      const data = body.data || [];
      setRefunds(data);
      const pag = body.pagination;
      setRefundTotalPages(pag?.totalPages ?? 1);
      setRefundTotal(pag?.total ?? data.length);
      setRefundHasNext((pag?.page ?? refundPage) < (pag?.totalPages ?? 1));
      setRefundHasPrev((pag?.page ?? refundPage) > 1);
    } catch {
      setRefunds([]);
    } finally {
      setRefundsLoading(false);
    }
  }, [refundPage]);

  useEffect(() => {
    void fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    void fetchRefunds();
  }, [fetchRefunds]);

  useEffect(() => {
    monetizationApi.listPlans().then((res) => {
      setPlans((res.data as { data?: SubscriptionPlan[] }).data || []);
    }).catch(() => setPlans([]));
  }, []);

  useEffect(() => {
    let filtered = allRows;
    if (statusFilter) filtered = filtered.filter((t) => t.status === statusFilter);
    if (providerFilter) filtered = filtered.filter((t) => t.provider === providerFilter);
    setRows(filtered);
  }, [allRows, statusFilter, providerFilter]);

  const providers = useMemo(
    () => [...new Set(allRows.map((t) => t.provider).filter(Boolean))],
    [allRows],
  );
  const statuses = useMemo(
    () => [...new Set(allRows.map((t) => t.status).filter(Boolean))],
    [allRows],
  );

  const handleGrant = async () => {
    if (!grantUserId.trim() || !grantPlanId) {
      notify("error", "User ID and plan are required");
      return;
    }
    setGrantBusy(true);
    try {
      await monetizationApi.adminGrant({
        userId: grantUserId.trim(),
        planId: grantPlanId,
        durationMonths: 1,
        confirmReplace: true,
      });
      notify("success", "Subscription granted");
      setGrantOpen(false);
      setGrantUserId("");
      setGrantPlanId("");
      void fetchTransactions();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      notify("error", msg || "Grant failed");
    } finally {
      setGrantBusy(false);
    }
  };

  const txColumns: Column<PaymentTransaction & Record<string, unknown>>[] = useMemo(
    () => [
      {
        key: "user",
        header: "User",
        render: (t) => (
          <button
            type="button"
            onClick={() => setDetailTx(t as PaymentTransaction)}
            className="text-left hover:text-primary hover:underline"
          >
            {t.user?.email || t.userId}
          </button>
        ),
        exportValue: (t) => t.user?.email || t.userId,
      },
      {
        key: "provider",
        header: "Provider",
        exportValue: (t) => t.provider,
      },
      {
        key: "amountPaise",
        header: "Amount",
        render: (t) => formatInr(t.amountPaise),
        exportValue: (t) => (t.amountPaise / 100).toFixed(2),
      },
      {
        key: "status",
        header: "Status",
        render: (t) => <StatusBadge status={t.status} />,
        exportValue: (t) => t.status,
      },
      {
        key: "createdAt",
        header: "Date",
        render: (t) => new Date(t.createdAt).toLocaleString(),
        exportValue: (t) => t.createdAt,
      },
      {
        key: "actions",
        header: "",
        render: (t) => {
          const invoiceId = (t as PaymentTransaction).invoice?.id || t.id;
          return (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDetailTx(t as PaymentTransaction)}
                className="rounded p-1.5 text-primary hover:bg-muted"
                aria-label="View transaction"
              >
                <Eye size={16} />
              </button>
              <a
                href={monetizationApi.invoicePdfUrl(invoiceId)}
                target="_blank"
                rel="noreferrer"
                className="rounded p-1.5 text-amber-700 hover:bg-amber-50"
                title="Download GST PDF"
                aria-label="Download invoice PDF"
              >
                <FileDown size={16} />
              </a>
            </div>
          );
        },
      },
    ],
    [],
  );

  const refundColumns: Column<RefundRow & Record<string, unknown>>[] = useMemo(
    () => [
      {
        key: "id",
        header: "Refund ID",
        render: (r) => <span className="font-mono text-xs">{r.id.slice(0, 10)}…</span>,
        exportValue: (r) => r.id,
      },
      {
        key: "amountPaise",
        header: "Amount",
        render: (r) => formatInr(r.amountPaise),
        exportValue: (r) => (r.amountPaise / 100).toFixed(2),
      },
      {
        key: "status",
        header: "Status",
        render: (r) => <StatusBadge status={r.status} />,
        exportValue: (r) => r.status,
      },
      {
        key: "provider",
        header: "Provider",
        render: (r) => r.transaction?.provider || "—",
        exportValue: (r) => r.transaction?.provider,
      },
      {
        key: "createdAt",
        header: "Date",
        render: (r) => new Date(r.createdAt).toLocaleString(),
        exportValue: (r) => r.createdAt,
      },
    ],
    [],
  );

  return (
    <div className="animate-fade-in space-y-8">
      <PageHeader
        title="Transactions"
        description="IAP and Razorpay payment log with invoices, refunds, and admin grants."
        icon={Receipt}
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setGrantOpen(true)} className="admin-btn-secondary">
              <Gift size={16} /> Grant Subscription
            </button>
            <button
              type="button"
              onClick={() => {
                void fetchTransactions();
                void fetchRefunds();
              }}
              className="admin-btn-secondary"
            >
              <RefreshCw size={16} /> Refresh
            </button>
          </div>
        }
      />

      {error && !loading ? (
        <EmptyState
          icon={AlertCircle}
          title="Could not load transactions"
          description={error}
          action={
            <button type="button" onClick={() => void fetchTransactions()} className="admin-btn-primary">
              Retry
            </button>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Filter size={16} className="text-muted-foreground" aria-hidden />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="admin-input w-auto min-w-[140px]"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="admin-input w-auto min-w-[140px]"
              aria-label="Filter by provider"
            >
              <option value="">All providers</option>
              {providers.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {(statusFilter || providerFilter) && (
              <button
                type="button"
                onClick={() => { setStatusFilter(""); setProviderFilter(""); }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear filters
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                disabled={!rows.length}
                onClick={() => exportTableData(txColumns, rows as (PaymentTransaction & Record<string, unknown>)[], "transactions", "csv")}
                className="admin-btn-secondary py-1.5 text-xs disabled:opacity-50"
              >
                Export CSV
              </button>
              <button
                type="button"
                disabled={!rows.length}
                onClick={() => exportTableData(txColumns, rows as (PaymentTransaction & Record<string, unknown>)[], "transactions", "excel")}
                className="admin-btn-secondary py-1.5 text-xs disabled:opacity-50"
              >
                Export Excel
              </button>
            </div>
          </div>

          {!loading && rows.length === 0 ? (
            <EmptyState icon={Receipt} title="No transactions" description="No payment records match your filters." />
          ) : (
            <DataTable
              columns={txColumns}
              data={rows as (PaymentTransaction & Record<string, unknown>)[]}
              loading={loading}
              page={page}
              totalPages={totalPages}
              totalRecords={statusFilter || providerFilter ? rows.length : totalRecords}
              hasNext={hasNext}
              hasPrev={hasPrev}
              onPageChange={setPage}
              emptyMessage="No transactions found"
              showFirstLast
              pageSize={PAGE_SIZE}
            />
          )}
        </>
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold">Refunds</h2>
        {!refundsLoading && refunds.length === 0 ? (
          <EmptyState icon={Receipt} title="No refunds" description="No refund records yet." />
        ) : (
          <DataTable
            columns={refundColumns}
            data={refunds as (RefundRow & Record<string, unknown>)[]}
            loading={refundsLoading}
            page={refundPage}
            totalPages={refundTotalPages}
            totalRecords={refundTotal}
            hasNext={refundHasNext}
            hasPrev={refundHasPrev}
            onPageChange={setRefundPage}
            emptyMessage="No refunds found"
            exportFilename="refunds-export"
            showFirstLast
            pageSize={PAGE_SIZE}
          />
        )}
      </section>

      <Drawer open={!!detailTx} onClose={() => setDetailTx(null)} title="Transaction Details" width="max-w-lg">
        {detailTx && (
          <div className="space-y-4">
            <dl>
              <FieldRow label="Transaction ID">
                <span className="font-mono text-xs">{detailTx.id}</span>
              </FieldRow>
              <FieldRow label="User">{detailTx.user?.name || detailTx.user?.email || detailTx.userId}</FieldRow>
              <FieldRow label="Email">{detailTx.user?.email || "—"}</FieldRow>
              <FieldRow label="Provider">{detailTx.provider}</FieldRow>
              <FieldRow label="Amount">{formatInr(detailTx.amountPaise)}</FieldRow>
              <FieldRow label="Status"><StatusBadge status={detailTx.status} /></FieldRow>
              <FieldRow label="Plan">{detailTx.subscription?.plan?.name || "—"}</FieldRow>
              <FieldRow label="Date">{new Date(detailTx.createdAt).toLocaleString()}</FieldRow>
            </dl>
            <a
              href={monetizationApi.invoicePdfUrl(detailTx.invoice?.id || detailTx.id)}
              target="_blank"
              rel="noreferrer"
              className="admin-btn-primary inline-flex w-full justify-center"
            >
              <FileDown size={16} /> Download GST Invoice PDF
            </a>
          </div>
        )}
      </Drawer>

      <Drawer open={grantOpen} onClose={() => setGrantOpen(false)} title="Grant Subscription" width="max-w-md">
        <div className="space-y-4">
          <div>
            <label htmlFor="grant-user" className="mb-1 block text-sm font-medium">User ID</label>
            <input
              id="grant-user"
              className="admin-input font-mono text-sm"
              value={grantUserId}
              onChange={(e) => setGrantUserId(e.target.value)}
              placeholder="User cuid…"
            />
          </div>
          <div>
            <label htmlFor="grant-plan" className="mb-1 block text-sm font-medium">Plan</label>
            <select
              id="grant-plan"
              className="admin-input"
              value={grantPlanId}
              onChange={(e) => setGrantPlanId(e.target.value)}
            >
              <option value="">Select plan</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.audience})</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setGrantOpen(false)} className="admin-btn-secondary">Cancel</button>
            <button
              type="button"
              disabled={grantBusy}
              onClick={() => void handleGrant()}
              className="admin-btn-primary disabled:opacity-50"
            >
              {grantBusy ? "Granting…" : "Grant"}
            </button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
