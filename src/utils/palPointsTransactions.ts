/** Structural subset of WalletTransaction used by PalPoints/Wallet history rows. */
export interface PalWalletTx {
  type: 'EARN' | 'SPEND' | 'REFUND' | string;
  reason: string;
  referenceType: string | null;
  amount?: number;
}

export type TxKind = "earned" | "redeemed" | "refund";

export interface TxRender {
  /** Valid MaterialCommunityIcons glyph name (used by Wallet history). */
  icon: string;
  /** Valid Ionicons glyph name (used by PalPoints history). */
  ionIcon: string;
  color: string;
  bg: string;
  kind: TxKind;
  label: string;
  description: string;
}

type TxCategory =
  | "review"
  | "reel"
  | "hiddenGem"
  | "photo"
  | "dailyLogin"
  | "dailyOpen"
  | "game"
  | "itinerary"
  | "ad"
  | "collab"
  | "checkin"
  | "offerCredit"
  | "partner"
  | "transfer"
  | "spend"
  | "refund"
  | "clawback"
  | "admin"
  | "otherEarn";

interface CategoryStyle {
  icon: string;
  ionIcon: string;
  color: string;
  bg: string;
  defaultLabel: string;
}

export const PALPOINTS_CATEGORY_STYLES: Record<TxCategory, CategoryStyle> = {
  review: {
    icon: "star-outline",
    ionIcon: "star",
    color: "#F59E0B",
    bg: "#FFFBEB",
    defaultLabel: "Vendor Review",
  },
  reel: {
    icon: "movie-open-outline",
    ionIcon: "film-outline",
    color: "#D81B60",
    bg: "#FCE4EC",
    defaultLabel: "Creator Moment",
  },
  hiddenGem: {
    icon: "diamond-stone",
    ionIcon: "prism-outline",
    color: "#8B5CF6",
    bg: "#F5F3FF",
    defaultLabel: "Hidden Gem",
  },
  photo: {
    icon: "image-outline",
    ionIcon: "camera",
    color: "#7B1FA2",
    bg: "#F3E5F5",
    defaultLabel: "Place Photo Approved",
  },
  dailyLogin: {
    icon: "calendar-check",
    ionIcon: "calendar",
    color: "#F57C00",
    bg: "#FFF3E0",
    defaultLabel: "Daily Login Reward",
  },
  dailyOpen: {
    icon: "calendar",
    ionIcon: "calendar-outline",
    color: "#E64A19",
    bg: "#FBE9E7",
    defaultLabel: "Daily Open Reward",
  },
  game: {
    icon: "gamepad-variant-outline",
    ionIcon: "game-controller-outline",
    color: "#6D28D9",
    bg: "#EDE9FE",
    defaultLabel: "Game Reward",
  },
  itinerary: {
    icon: "map-marker-radius",
    ionIcon: "map-outline",
    color: "#E64A19",
    bg: "#FBE9E7",
    defaultLabel: "Itinerary Reward",
  },
  ad: {
    icon: "play-circle-outline",
    ionIcon: "play-circle-outline",
    color: "#1976D2",
    bg: "#E3F2FD",
    defaultLabel: "Rewarded Ad",
  },
  collab: {
    icon: "handshake-outline",
    ionIcon: "hand-left-outline",
    color: "#3B82F6",
    bg: "#EFF6FF",
    defaultLabel: "Collaboration Reward",
  },
  checkin: {
    icon: "map-marker",
    ionIcon: "location",
    color: "#3B82F6",
    bg: "#EFF6FF",
    defaultLabel: "Place Check-in",
  },
  offerCredit: {
    icon: "storefront-outline",
    ionIcon: "storefront-outline",
    color: "#1976D2",
    bg: "#E3F2FD",
    defaultLabel: "Offer Redemption Credit",
  },
  partner: {
    icon: "handshake-outline",
    ionIcon: "hand-left-outline",
    color: "#8B5CF6",
    bg: "#F5F3FF",
    defaultLabel: "Partner Offer Redemption",
  },
  transfer: {
    icon: "swap-horizontal",
    ionIcon: "swap-horizontal",
    color: "#1976D2",
    bg: "#E3F2FD",
    defaultLabel: "Points Transfer",
  },
  spend: {
    icon: "gift-outline",
    ionIcon: "gift-outline",
    color: "#C94A4A",
    bg: "#FFEBEE",
    defaultLabel: "Points Redeemed",
  },
  refund: {
    icon: "rotate-left",
    ionIcon: "refresh",
    color: "#111111",
    bg: "#F2F2F2",
    defaultLabel: "Refund",
  },
  clawback: {
    icon: "rotate-left",
    ionIcon: "refresh",
    color: "#C94A4A",
    bg: "#FFEBEE",
    defaultLabel: "Refund Reversal",
  },
  admin: {
    icon: "account-cog-outline",
    ionIcon: "settings-outline",
    color: "#111111",
    bg: "#F2F2F2",
    defaultLabel: "Wallet Adjustment",
  },
  otherEarn: {
    icon: "star-outline",
    ionIcon: "star",
    color: "#111111",
    bg: "#F2F2F2",
    defaultLabel: "Points Earned",
  },
};

export function humanizeWalletToken(value: string | null | undefined): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "Wallet";
  if (/[_-]/.test(trimmed) || /^[A-Z0-9]{3,}$/.test(trimmed)) {
    return trimmed
      .replace(/[_-]+/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return trimmed;
}

function friendlyReferenceType(referenceType: string | null): string {
  switch (referenceType) {
    case "VENDOR_REVIEW":
      return "Vendor Review";
    case "LOGIN_REWARD":
      return "Daily Login";
    case "DAILY_OPEN":
      return "Daily Open";
    case "OFFER":
      return "Vendor Offer";
    case "POINTS_TRANSFER":
      return "Points Transfer";
    case "PAL_POINTS_PARTNER":
      return "Partner Offer";
    case "REFUND":
      return "Refund";
    case "REWARDED_AD":
      return "Rewarded Ad";
    case "GAME":
      return "Game";
    case "ADMIN_ADJUSTMENT":
      return "Admin";
    default:
      return humanizeWalletToken(referenceType);
  }
}

/** Pull a human label out of internal reason strings like `redeem:Coffee` or `Sent to Alex`. */
export function entityFromReason(reason: string): string | null {
  if (!reason) return null;
  const lower = reason.toLowerCase();
  for (const prefix of ["redeem:", "partner_redeem:", "partner_offer_redeem:", "offer_redeem:", "rewarded_ad:"]) {
    if (lower.startsWith(prefix)) {
      const rest = reason.slice(prefix.length).trim();
      return rest.length > 0 ? rest : null;
    }
  }
  if (lower.startsWith("sent to ")) {
    const rest = reason.slice("sent to ".length).trim();
    return rest.length > 0 ? rest : null;
  }
  if (lower.startsWith("received from ")) {
    const rest = reason.slice("received from ".length).trim();
    return rest.length > 0 ? rest : null;
  }
  return null;
}

export function txCategory(tx: PalWalletTx): TxCategory {
  const reason = (tx.reason || "").toLowerCase();
  const ref = tx.referenceType || "";
  const isRefund = ref === "REFUND" || reason.includes("refund") || reason.startsWith("refund");
  const isSpend = tx.type === "SPEND" || Number(tx.amount) < 0;

  if (isRefund) {
    if (isSpend || reason.includes("clawback") || reason.includes("reverse")) {
      return "clawback";
    }
    return "refund";
  }

  if (isSpend) {
    if (reason.includes("partner")) return "partner";
    if (reason.includes("redeem") || reason.includes("offer")) return "spend";
    if (reason.includes("transfer") || reason.includes("sent to")) return "transfer";
    return "spend";
  }

  if (ref === "OFFER") return "offerCredit";
  if (ref === "POINTS_TRANSFER" || reason.includes("received from") || (reason.includes("transfer") && reason.includes("received"))) {
    return "transfer";
  }
  if (ref === "PAL_POINTS_PARTNER" || reason.includes("partner")) return "partner";

  if (reason.includes("hidden")) return "hiddenGem";
  if (reason.includes("review")) return "review";
  if (reason.includes("daily_login")) return "dailyLogin";
  if (ref === "LOGIN_REWARD") return "dailyLogin";
  if (reason.includes("daily_open") || reason.includes("daily open") || reason.includes("open palsafar")) return "dailyOpen";
  if (reason.includes("reel")) return "reel";
  if (reason.includes("game")) return "game";
  if (reason.includes("rewarded_ad") || reason.includes("watch an ad") || reason.includes("watch a short ad")) return "ad";
  if (reason.includes("itinerary")) return "itinerary";
  if (reason.includes("place_image") || reason.includes("place photo") || reason.includes("uploads a photo") || reason.includes("uploaded")) return "photo";
  if (reason.includes("collab")) return "collab";
  if (reason.includes("check-in") || reason.includes("checkin") || reason.includes("checked in") || reason.includes("place_visit") || reason.includes("place visit")) {
    return "checkin";
  }
  if (ref === "ADMIN_ADJUSTMENT" || reason.includes("admin") || reason.includes("adjustment")) return "admin";

  return "otherEarn";
}

export function txRender(tx: PalWalletTx): TxRender {
  const category = txCategory(tx);
  const style = PALPOINTS_CATEGORY_STYLES[category];
  const entity = entityFromReason(tx.reason || "");
  const label =
    category === "spend" && entity
      ? "Offer Redemption"
      : category === "transfer"
        ? entity && /received/i.test(tx.reason || "")
          ? "Points Received"
          : entity
            ? "Points Sent"
            : "Points Transfer"
        : style.defaultLabel;
  const description = entity ?? friendlyReferenceType(tx.referenceType ?? null);
  const kind: TxKind =
    category === "clawback"
      ? "redeemed"
      : category === "refund"
        ? "refund"
        : category === "spend" || category === "partner" || category === "transfer" || category === "offerCredit"
          ? Number(tx.amount) < 0 || tx.type === "SPEND"
            ? "redeemed"
            : "earned"
          : "earned";
  return { icon: style.icon, ionIcon: style.ionIcon, color: style.color, bg: style.bg, kind, label, description };
}

export interface TxAmountRender {
  /** "+" for credits (including refunds), "−" for debits. */
  prefix: string;
  value: string;
  isPositive: boolean;
}

export function txAmountRender(tx: Pick<PalWalletTx, "amount">): TxAmountRender {
  const amount = Number(tx.amount) || 0;
  const isPositive = amount >= 0;
  return {
    prefix: isPositive ? "+" : "−",
    value: Math.abs(amount).toLocaleString(),
    isPositive,
  };
}

export function txFriendlyLabel(tx: PalWalletTx): string {
  return txRender(tx).label;
}