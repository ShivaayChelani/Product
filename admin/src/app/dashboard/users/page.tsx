"use client";

import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search, Eye, Check, X, Trash2, Users, RefreshCw, Wallet, Map, AlertCircle } from "lucide-react";
import { getUser, getUsers, updateUserRole, deleteUser } from "@/services/users";
import { getVendor, verifyVendor } from "@/services/vendors";
import { getCreatorApplications, verifyCreator } from "@/services/creators";
import client from "@/services/client";
import { getApiErrorCode } from "@/services/client";
import { useNotification } from "@/components/Notification";
import DataTable from "@/components/DataTable";
import type { Column } from "@/components/DataTable";
import StatusBadge from "@/components/StatusBadge";
import ConfirmDialog from "@/components/ConfirmDialog";
import GrantSubscriptionModal from "@/components/GrantSubscriptionModal";
import PageHeader from "@/components/ui/PageHeader";
import Drawer from "@/components/ui/Drawer";
import EmptyState from "@/components/ui/EmptyState";
import type { User, UserCreatorApplication, UserVendorApplication, SingleResponse, AppRole } from "@/types";
import { isAdminDashboardUser } from "@/lib/adminRoles";

function isVendorAccount(user: User): boolean {
  if (user.permission === "VENDOR") return true;
  if (user.vendor) return true;
  const roles = user.approvedRoles || user.roles || [];
  return roles.includes("VENDOR" as AppRole);
}

function displayValue(value: ReactNode): ReactNode {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-2 border-b border-border py-2.5 last:border-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground break-words">{displayValue(children)}</dd>
    </div>
  );
}

function ExternalLink({ href, label }: { href: string; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-900"
    >
      {label || href}
    </a>
  );
}

function LinkList({ urls }: { urls?: string[] | null }) {
  if (!urls?.length) return null;
  return (
    <ul className="space-y-1">
      {urls.map((url) => (
        <li key={url}>
          <ExternalLink href={url} />
        </li>
      ))}
    </ul>
  );
}

function VendorApplicationReview({ vendor }: { vendor: UserVendorApplication }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-amber-900">What they submitted — Vendor</h3>
        <StatusBadge status={vendor.status || "—"} />
      </div>
      <dl>
        <FieldRow label="Business name">{vendor.businessName}</FieldRow>
        <FieldRow label="Business type">{vendor.businessType?.replace(/_/g, " ")}</FieldRow>
        <FieldRow label="Phone">{vendor.phone}</FieldRow>
        <FieldRow label="Address">{vendor.address}</FieldRow>
        <FieldRow label="City">{vendor.city}</FieldRow>
        <FieldRow label="State">{vendor.state}</FieldRow>
        <FieldRow label="Description">{vendor.description}</FieldRow>
        <FieldRow label="Website">
          {vendor.website ? <ExternalLink href={vendor.website} /> : null}
        </FieldRow>
        <FieldRow label="Operating hours">{vendor.operatingHours}</FieldRow>
        <FieldRow label="GST number">{vendor.gstNumber}</FieldRow>
        <FieldRow label="Location">
          {vendor.latitude != null && vendor.longitude != null
            ? `${vendor.latitude}, ${vendor.longitude}`
            : null}
        </FieldRow>
        <FieldRow label="Cover image">
          {vendor.imageUrl ? <ExternalLink href={vendor.imageUrl} label="Open image" /> : null}
        </FieldRow>
        <FieldRow label="Images">
          <LinkList urls={vendor.images} />
        </FieldRow>
        <FieldRow label="Documents">
          <LinkList urls={vendor.documents} />
        </FieldRow>
        <FieldRow label="Rejection reason">{vendor.rejectionReason}</FieldRow>
        <FieldRow label="Submitted">
          {vendor.createdAt ? new Date(vendor.createdAt).toLocaleString() : null}
        </FieldRow>
      </dl>
    </div>
  );
}

function CreatorApplicationReview({ creator }: { creator: UserCreatorApplication }) {
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-indigo-900">What they submitted — Creator</h3>
        <StatusBadge status={creator.status || "—"} />
      </div>
      <dl>
        <FieldRow label="Username">{creator.username ? `@${creator.username}` : null}</FieldRow>
        <FieldRow label="Full name">{creator.fullName}</FieldRow>
        <FieldRow label="Bio">{creator.bio}</FieldRow>
        <FieldRow label="Categories">
          {creator.travelCategories?.length ? creator.travelCategories.join(", ") : null}
        </FieldRow>
        <FieldRow label="Languages">
          {creator.languages?.length ? creator.languages.join(", ") : null}
        </FieldRow>
        <FieldRow label="Instagram">
          {creator.instagramUrl ? <ExternalLink href={creator.instagramUrl} /> : null}
        </FieldRow>
        <FieldRow label="YouTube">
          {creator.youtubeUrl ? <ExternalLink href={creator.youtubeUrl} /> : null}
        </FieldRow>
        <FieldRow label="Facebook">
          {creator.facebookUrl ? <ExternalLink href={creator.facebookUrl} /> : null}
        </FieldRow>
        <FieldRow label="Sample reel">
          {creator.sampleReelUrl ? <ExternalLink href={creator.sampleReelUrl} label="Open reel" /> : null}
        </FieldRow>
        <FieldRow label="Government ID">
          {creator.governmentIdUrl ? <ExternalLink href={creator.governmentIdUrl} label="Open document" /> : null}
        </FieldRow>
        <FieldRow label="Portfolio">
          <LinkList urls={creator.portfolioLinks} />
        </FieldRow>
        <FieldRow label="Why apply">{creator.applicationReason}</FieldRow>
        <FieldRow label="Avatar">
          {creator.avatar ? <ExternalLink href={creator.avatar} label="Open avatar" /> : null}
        </FieldRow>
        <FieldRow label="Rejection reason">{creator.rejectionReason}</FieldRow>
        <FieldRow label="Submitted">
          {creator.createdAt ? new Date(creator.createdAt).toLocaleString() : null}
        </FieldRow>
      </dl>
    </div>
  );
}

type GrantTarget = "USER" | "VENDOR" | "CONTENT_CREATOR";

const grantRoleLabel = (target: GrantTarget) => {
  switch (target) {
    case "USER":
      return "User";
    case "VENDOR":
      return "Vendor";
    case "CONTENT_CREATOR":
      return "Content Creator";
  }
};

const askedPermissionLabel = (user: User): { role: string; status: string } | null => {
  if (user.vendor?.status === "PENDING" || user.vendor?.status === "CHANGES_REQUESTED") {
    return { role: "Vendor", status: user.vendor.status };
  }
  if (user.creatorProfile?.status === "PENDING" || user.creatorProfile?.status === "CHANGES_REQUESTED") {
    return { role: "Content Creator", status: user.creatorProfile.status };
  }
  if (user.vendor?.status === "APPROVED") {
    return { role: "Vendor", status: "APPROVED" };
  }
  if (user.creatorProfile?.status === "APPROVED") {
    return { role: "Content Creator", status: "APPROVED" };
  }
  return null;
};

const ATTENTION_STATUSES = ["PENDING", "CHANGES_REQUESTED"];

/** True when vendor/creator application still needs admin approve/reject. */
const needsRoleAttention = (user: User) =>
  ATTENTION_STATUSES.includes(user.vendor?.status || "")
  || ATTENTION_STATUSES.includes(user.creatorProfile?.status || "");

/** True when their asked role is already approved (no pending request left). */
const isRoleAlreadyApproved = (user: User) => {
  const asked = askedPermissionLabel(user);
  return asked?.status === "APPROVED";
};

/** Statuses in which a professional role is still "held" (exclusivity applies). */
const HELD_STATUSES = ["PENDING", "APPROVED", "CHANGES_REQUESTED", "SUSPENDED", "PAUSED"];

const holdsBothProfessionalRoles = (user: User) =>
  HELD_STATUSES.includes(user.vendor?.status || "")
  && HELD_STATUSES.includes(user.creatorProfile?.status || "");

const FILTER_TABS = [
  { label: "All Users", value: "all" },
  { label: "Pending Approval", value: "pending" },
  { label: "Admins", value: "ADMIN" },
  { label: "Vendors", value: "VENDOR" },
  { label: "Creators", value: "CONTENT_CREATOR" },
] as const;

export default function UsersPage() {
  const { notify } = useNotification();
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<(typeof FILTER_TABS)[number]["value"]>("all");
  const [permissionFilter, setPermissionFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [grantByUser, setGrantByUser] = useState<Record<string, GrantTarget>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailUser, setDetailUser] = useState<User | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant: "primary" | "danger";
    action: () => Promise<void>;
  }>({ open: false, title: "", message: "", variant: "primary", action: async () => {} });

  const [grantTarget, setGrantTarget] = useState<{ id: string; name: string; targetRole?: string } | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) setCurrentUser(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const selectFilterTab = (value: (typeof FILTER_TABS)[number]["value"]) => {
    setFilterTab(value);
    if (value === "pending" || value === "all") {
      setPermissionFilter("");
    } else {
      setPermissionFilter(value);
    }
    setPage(1);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await getUsers({
        page,
        limit: 15,
        search: search || undefined,
        permission: permissionFilter || undefined,
        pendingApproval: filterTab === "pending" ? true : undefined,
      });
      setUsers(res.data);
      setTotalPages(res.pagination.totalPages);
      setTotalRecords(res.pagination.total);
      setHasNext(res.pagination.hasNext);
      setHasPrev(res.pagination.hasPrev);
    } catch (err) {
      setUsers([]);
      setLoadError(err instanceof Error ? err.message : "Failed to load users");
      notify("error", "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [page, search, permissionFilter, filterTab, notify]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const selectedGrant = useCallback((user: User): GrantTarget =>
    grantByUser[user.id]
    || (ATTENTION_STATUSES.includes(user.vendor?.status || "")
      ? "VENDOR"
      : ATTENTION_STATUSES.includes(user.creatorProfile?.status || "")
        ? "CONTENT_CREATOR"
        : user.vendor?.status === "APPROVED"
          ? "VENDOR"
          : user.creatorProfile?.status === "APPROVED"
            ? "CONTENT_CREATOR"
            : "USER"), [grantByUser]);

  const isSelf = useCallback((user: User) => !!(currentUser && user.id === currentUser.id), [currentUser]);

  const openUserDetail = useCallback(async (user: User) => {
    setDetailUser(user);
    setDetailLoading(true);
    try {
      // Load user first, then enrich from vendor/creator admin APIs which already
      // return the full submitted form (works even if GET /users/:id is still thin).
      const fullUser = await getUser(user.id).catch(() => user);
      const vendorId = fullUser.vendor?.id ?? user.vendor?.id;
      const creatorId = fullUser.creatorProfile?.id ?? user.creatorProfile?.id;

      const [vendorDetail, creators] = await Promise.all([
        vendorId ? getVendor(vendorId).catch(() => null) : Promise.resolve(null),
        creatorId || fullUser.creatorProfile || user.creatorProfile
          ? getCreatorApplications().catch(() => [])
          : Promise.resolve([]),
      ]);

      const creatorMatch = creators.find(
        (c) => c.id === creatorId || c.userId === fullUser.id || c.userId === user.id,
      );

      setDetailUser({
        ...fullUser,
        vendor: vendorDetail
          ? { ...fullUser.vendor, ...vendorDetail, id: vendorDetail.id }
          : fullUser.vendor ?? user.vendor,
        creatorProfile: creatorMatch
          ? { ...fullUser.creatorProfile, ...creatorMatch, id: creatorMatch.id }
          : fullUser.creatorProfile ?? user.creatorProfile,
      });

      try {
        const wr = await client.get<SingleResponse<{ palPoints?: number }>>(`/wallet/admin/${fullUser.id}`);
        setWalletBalance(wr.data.data?.palPoints ?? null);
      } catch {
        setWalletBalance(null);
      }
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to load application details");
    } finally {
      setDetailLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    const permission = searchParams.get("permission");
    const id = searchParams.get("id");

    if (permission) {
      const tabMatch = FILTER_TABS.find((t) => t.value === permission);
      if (tabMatch) {
        setFilterTab(tabMatch.value);
        setPermissionFilter(tabMatch.value === "all" || tabMatch.value === "pending" ? "" : tabMatch.value);
      } else {
        setFilterTab("all");
        setPermissionFilter(permission);
      }
      setPage(1);
    }

    if (id) {
      void getUser(id)
        .then((user) => openUserDetail(user))
        .catch(() => notify("error", "User not found"));
    }
  }, [searchParams, notify, openUserDetail]);

  const handleApprove = useCallback((user: User) => {
    if (isSelf(user)) {
      notify("error", "You cannot change your own role.");
      return;
    }
    const target = selectedGrant(user);
    const roleLabel = grantRoleLabel(target);

    const grant = async (confirmSwitch: boolean) => {
      setBusyId(user.id);
      try {
        if (target === "VENDOR" && user.vendor?.id && user.vendor.status === "PENDING" && !confirmSwitch) {
          await verifyVendor(user.vendor.id, "APPROVED");
        } else if (target === "CONTENT_CREATOR" && user.creatorProfile?.id && user.creatorProfile.status === "PENDING" && !confirmSwitch) {
          await verifyCreator(user.creatorProfile.id, "APPROVED");
        } else {
          await updateUserRole(user.id, target, confirmSwitch || undefined);
        }
        notify("success", `${roleLabel} granted`);
        fetchUsers();
      } catch (err) {
        const code = getApiErrorCode(err);
        if (!confirmSwitch && (code === "SWITCH_CONFIRMATION_REQUIRED" || code === "ROLE_ALREADY_EXISTS")) {
          // Exclusivity: this account holds the other professional role. Confirm the switch —
          // the retry goes through updateUserRole with confirmSwitch so the backend retires it.
          const otherRoleLabel = target === "VENDOR" ? "Content Creator" : "Vendor";
          setConfirmDialog({
            open: true,
            title: "Switch professional role?",
            message: `${user.name || user.email} currently holds the ${otherRoleLabel} role. An account may only have ONE professional role — granting ${roleLabel} will retire their ${otherRoleLabel} role. Continue?`,
            variant: "danger",
            action: () => grant(true),
          });
          return;
        }
        notify("error", err instanceof Error ? err.message : "Failed to grant role");
      } finally {
        setBusyId(null);
      }
    };

    setConfirmDialog({
      open: true,
      title: `Grant ${roleLabel}`,
      message: `Grant ${roleLabel} on ${user.name || user.email}? Same account — no new login.`,
      variant: "primary",
      action: () => grant(false),
    });
  }, [isSelf, selectedGrant, notify, fetchUsers]);

  const handleDelete = useCallback((user: User) => {
    if (isSelf(user)) {
      notify("error", "You cannot delete your own account.");
      return;
    }
    if (isAdminDashboardUser(user)) {
      notify("error", "Admin accounts cannot be deleted from here.");
      return;
    }
    setConfirmDialog({
      open: true,
      title: "Delete User",
      message: `Permanently delete ${user.name || user.email}? This removes their account and related data. This cannot be undone.`,
      variant: "danger",
      action: async () => {
        setBusyId(user.id);
        try {
          await deleteUser(user.id);
          notify("success", "User deleted");
          if (detailUser?.id === user.id) setDetailUser(null);
          fetchUsers();
        } catch (err) {
          notify("error", err instanceof Error ? err.message : "Failed to delete user");
        } finally {
          setBusyId(null);
        }
      },
    });
  }, [isSelf, notify, detailUser?.id, fetchUsers]);

  const handleReject = useCallback((user: User) => {
    if (isSelf(user)) {
      notify("error", "You cannot change your own role.");
      return;
    }
    const target = selectedGrant(user);
    if (target === "USER") {
      notify("error", "The base User role cannot be rejected.");
      return;
    }
    const reason = window.prompt("Rejection reason:") || "Rejected by admin";
    if (!reason.trim()) return;

    setConfirmDialog({
      open: true,
      title: target === "VENDOR" ? "Reject Vendor" : "Reject Content Creator",
      message: `Reject ${target === "VENDOR" ? "vendor" : "creator"} request for ${user.name || user.email}?`,
      variant: "danger",
      action: async () => {
        setBusyId(user.id);
        try {
          if (target === "VENDOR" && user.vendor?.id) {
            await verifyVendor(user.vendor.id, "REJECTED", reason.trim());
          } else if (target === "CONTENT_CREATOR" && user.creatorProfile?.id) {
            await verifyCreator(user.creatorProfile.id, "REJECTED", reason.trim());
          } else {
            await updateUserRole(user.id, "USER");
          }
          notify("success", "Request rejected");
          fetchUsers();
        } catch (err) {
          notify("error", err instanceof Error ? err.message : "Failed to reject");
        } finally {
          setBusyId(null);
        }
      },
    });
  }, [isSelf, selectedGrant, notify, fetchUsers]);

  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds).filter((id) => {
      const u = users.find((x) => x.id === id);
      return u && !isSelf(u) && !isAdminDashboardUser(u);
    });
    if (!ids.length) return;
    setConfirmDialog({
      open: true,
      title: "Bulk Delete Users",
      message: `Permanently delete ${ids.length} selected user account(s)? This cannot be undone.`,
      variant: "danger",
      action: async () => {
        setBulkLoading(true);
        let deleted = 0;
        for (const id of ids) {
          try {
            await deleteUser(id);
            deleted++;
          } catch {
            /* continue */
          }
        }
        notify("success", `Deleted ${deleted} of ${ids.length} users`);
        setSelectedIds(new Set());
        fetchUsers();
        setBulkLoading(false);
      },
    });
  };

  const columns: Column<User & Record<string, unknown>>[] = useMemo(() => [
    {
      key: "name",
      header: "User",
      exportValue: (item) => {
        const u = item as User;
        return `${u.name || "Unnamed"} <${u.email}>`;
      },
      render: (item) => (
        <button
          type="button"
          onClick={() => openUserDetail(item as User)}
          className="text-left"
        >
          <p className="font-medium text-foreground hover:text-primary hover:underline">{item.name || "Unnamed"}</p>
          <p className="text-xs text-muted-foreground">{item.email}</p>
        </button>
      ),
    },
    {
      key: "profileName",
      header: "Business / Creator page",
      exportValue: (item) => {
        const user = item as User;
        return [
          user.vendor?.businessName,
          user.creatorProfile?.fullName || (user.creatorProfile?.username ? `@${user.creatorProfile.username}` : undefined),
        ].filter(Boolean).join(" | ") || "";
      },
      render: (item) => {
        const user = item as User;
        const names = [
          user.vendor?.businessName,
          user.creatorProfile?.fullName || (user.creatorProfile?.username ? `@${user.creatorProfile.username}` : undefined),
        ].filter(Boolean);

        return names.length ? (
          <div className="space-y-0.5 text-sm text-gray-700">
            {names.map((name) => <p key={name}>{name}</p>)}
          </div>
        ) : <span className="text-gray-400">—</span>;
      },
    },
    {
      key: "permission",
      header: "Current Permission",
      exportValue: (item) => (item as User).permission || "USER",
      render: (item) => (
        <StatusBadge status={(item as User).permission || "USER"} />
      ),
    },
    {
      key: "grant",
      header: "Asked permission",
      exportValue: (item) => {
        const asked = askedPermissionLabel(item as User);
        return asked ? `${asked.role} (${asked.status})` : "No request";
      },
      render: (item) => {
        const user = item as User;
        const isAdminUser = isAdminDashboardUser(user);
        if (isSelf(user) || isAdminUser) {
          return <span className="text-xs text-gray-400">—</span>;
        }
        const asked = askedPermissionLabel(user);
        const roleLocked = isRoleAlreadyApproved(user);
        return (
          <div className="flex flex-col gap-1.5">
            {asked ? (
              <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                asked.status === "PENDING" || asked.status === "CHANGES_REQUESTED"
                  ? "bg-amber-100 text-amber-800"
                  : asked.status === "APPROVED"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-gray-100 text-gray-700"
              }`}>
                {asked.status === "PENDING" || asked.status === "CHANGES_REQUESTED"
                  ? "Requested: "
                  : asked.status === "APPROVED"
                    ? "Approved: "
                    : ""}{asked.role}
              </span>
            ) : (
              <span className="text-[11px] text-gray-400">No request</span>
            )}
            <select
              aria-label={`Grant role for ${user.email}`}
              value={selectedGrant(user)}
              onChange={(e) =>
                setGrantByUser((prev) => ({
                  ...prev,
                  [user.id]: e.target.value as GrantTarget,
                }))
              }
              disabled={busyId === user.id || roleLocked}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-medium outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-60"
            >
              <option value="USER">User</option>
              <option value="VENDOR">Vendor</option>
              <option value="CONTENT_CREATOR">Content Creator</option>
            </select>
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      render: (item) => {
        const user = item as User;
        const busy = busyId === user.id;
        const isAdminUser = isAdminDashboardUser(user);
        const canAct = !isSelf(user) && !isAdminUser && needsRoleAttention(user);
        const canDelete = !isSelf(user) && !isAdminUser;
        return (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => openUserDetail(user)}
              className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100"
              title="View application details"
            >
              <Eye size={16} />
            </button>
            {!isSelf(user) && !isAdminUser && isVendorAccount(user) ? (
              <button
                type="button"
                onClick={() => setGrantTarget({ id: user.id, name: user.name || user.email, targetRole: user.permission })}
                disabled={busy}
                className="rounded-lg px-2 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                title="Grant vendor subscription"
              >
                Grant Subscription
              </button>
            ) : null}
            {canAct ? (
              <>
                <button
                  type="button"
                  onClick={() => handleApprove(user)}
                  disabled={busy}
                  className="rounded-lg p-1.5 text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50"
                  title="Approve / grant"
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => handleReject(user)}
                  disabled={busy}
                  className="rounded-lg p-1.5 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  title="Reject"
                >
                  <X size={16} />
                </button>
              </>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                onClick={() => handleDelete(user)}
                disabled={busy}
                className="rounded-lg p-1.5 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                title="Delete user"
              >
                <Trash2 size={16} />
              </button>
            ) : null}
          </div>
        );
      },
    },
  ], [busyId, handleApprove, handleDelete, handleReject, isSelf, openUserDetail, selectedGrant]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Users"
        description="Manage user accounts, role approvals, subscriptions, wallet access, and account lifecycle."
        icon={Users}
        actions={
          <button type="button" onClick={() => fetchUsers()} className="admin-btn-secondary">
            <RefreshCw size={16} />
            Refresh
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => selectFilterTab(tab.value)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              filterTab === tab.value
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or email..."
            className="admin-input pl-10"
            aria-label="Search users"
          />
        </div>
      </div>

      {loadError && !loading && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <AlertCircle size={16} />
          {loadError}
          <button type="button" onClick={() => fetchUsers()} className="ml-auto font-medium underline">
            Retry
          </button>
        </div>
      )}

      {!loading && users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users found"
          description="Try adjusting search or filter criteria."
        />
      ) : (
      <DataTable
        columns={columns}
        data={users as (User & Record<string, unknown>)[]}
        loading={loading}
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        hasNext={hasNext}
        hasPrev={hasPrev}
        onPageChange={setPage}
        showFirstLast
        emptyMessage="No users found"
        exportFilename="users-export"
        selectable
        selectedIds={selectedIds}
        onSelectChange={setSelectedIds}
        getRowId={(item) => String(item.id)}
        toolbar={
          selectedIds.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{selectedIds.size} selected</span>
              <button type="button" disabled={bulkLoading} onClick={handleBulkDelete} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50">
                Bulk Delete
              </button>
              <button type="button" onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground">
                Clear
              </button>
            </div>
          ) : null
        }
      />
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
        confirmLabel={confirmDialog.variant === "danger" ? "Confirm" : "Grant"}
        onConfirm={async () => {
          // Close BEFORE running the action: the action may open a follow-up dialog
          // (e.g. switch confirmation), which must not be immediately closed again.
          const action = confirmDialog.action;
          setConfirmDialog((p) => ({ ...p, open: false }));
          await action();
        }}
        onCancel={() => setConfirmDialog((p) => ({ ...p, open: false }))}
      />

      {detailUser ? (
        <Drawer
          open={!!detailUser}
          onClose={() => { setDetailUser(null); setWalletBalance(null); }}
          title={detailUser.name || detailUser.email}
          width="max-w-2xl"
        >
          <div className="space-y-5">
            <div className="admin-card p-4">
              <h3 className="mb-3 text-sm font-semibold">Profile</h3>
              <dl>
                <FieldRow label="Email">{detailUser.email}</FieldRow>
                <FieldRow label="Permission"><StatusBadge status={detailUser.permission || "USER"} /></FieldRow>
                <FieldRow label="Joined">{detailUser.createdAt ? new Date(detailUser.createdAt).toLocaleString() : null}</FieldRow>
                {walletBalance != null && (
                  <FieldRow label="PalPoints">{walletBalance.toLocaleString()}</FieldRow>
                )}
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/dashboard/wallets?search=${encodeURIComponent(detailUser.email)}`} className="admin-btn-secondary py-1.5 text-xs">
                  <Wallet size={14} /> Wallet
                </Link>
                <Link href={`/dashboard/trips?search=${encodeURIComponent(detailUser.email)}`} className="admin-btn-secondary py-1.5 text-xs">
                  <Map size={14} /> Trips
                </Link>
              </div>
            </div>

            {detailLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading application details…</p>
            ) : (
              <>
                {holdsBothProfessionalRoles(detailUser) && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                    This account holds both professional roles (legacy data). Retire one role via Vendors or Creators.
                  </div>
                )}
                {!detailUser.vendor && !detailUser.creatorProfile ? (
                  <EmptyState title="No applications" description="No vendor or creator application on file." />
                ) : (
                  <div className="space-y-4">
                    {detailUser.vendor ? <VendorApplicationReview vendor={detailUser.vendor} /> : null}
                    {detailUser.creatorProfile ? (
                      <CreatorApplicationReview creator={detailUser.creatorProfile} />
                    ) : null}
                  </div>
                )}
              </>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              {!isSelf(detailUser) && !isAdminDashboardUser(detailUser) && isVendorAccount(detailUser) ? (
                <button
                  type="button"
                  onClick={() => {
                    const u = detailUser;
                    setDetailUser(null);
                    setGrantTarget({ id: u.id, name: u.name || u.email, targetRole: u.permission });
                  }}
                  className="admin-btn-secondary text-emerald-800"
                >
                  Grant Subscription
                </button>
              ) : null}
              {!isSelf(detailUser) && !isAdminDashboardUser(detailUser) && needsRoleAttention(detailUser) ? (
                <>
                  <button type="button" onClick={() => { const u = detailUser; setDetailUser(null); handleReject(u); }} className="admin-btn-secondary text-red-700">
                    Reject
                  </button>
                  <button type="button" onClick={() => { const u = detailUser; setDetailUser(null); handleApprove(u); }} className="admin-btn-primary">
                    Approve
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setDetailUser(null)} className="admin-btn-secondary">
                  Close
                </button>
              )}
              {!isSelf(detailUser) && !isAdminDashboardUser(detailUser) ? (
                <button type="button" onClick={() => { const u = detailUser; setDetailUser(null); handleDelete(u); }} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
                  Delete User
                </button>
              ) : null}
            </div>
          </div>
        </Drawer>
      ) : null}

      <GrantSubscriptionModal
        open={!!grantTarget}
        userId={grantTarget?.id || ""}
        userName={grantTarget?.name || ""}
        onClose={() => setGrantTarget(null)}
        onDone={fetchUsers}
      />
    </div>
  );
}
