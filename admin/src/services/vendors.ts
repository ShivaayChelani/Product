import client from "./client";
import type { PaginatedResponse, SingleResponse } from "@/types";

export type VendorStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CHANGES_REQUESTED"
  | "SUSPENDED"
  | "PAUSED"
  | "RETIRED";

export interface Vendor {
  id: string;
  userId: string;
  businessName: string;
  businessType: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  imageUrl: string | null;
  website: string | null;
  operatingHours: string | null;
  images: string[];
  documents?: string[];
  gstNumber?: string | null;
  vendorCode?: string | null;
  status: VendorStatus;
  rejectionReason: string | null;
  linkedSpotIds: string[];
  showOnMap: boolean;
  showContact: boolean;
  showWebsite: boolean;
  showImages: boolean;
  showOffers: boolean;
  showReels: boolean;
  showNavigation: boolean;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; email: string };
}

export interface VendorOffer {
  id: string;
  vendorId: string;
  title: string;
  description: string | null;
  discountType: string;
  discountValue: number;
  pointsRequired: number;
  minBillAmount: number | null;
  couponCode: string | null;
  dailyLimit: number | null;
  validTill: string | null;
  isActive: boolean;
  createdAt: string;
}

export async function getVendors(params?: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}): Promise<PaginatedResponse<Vendor>> {
  const res = await client.get<PaginatedResponse<Vendor>>("/vendors", { params });
  return res.data;
}

export async function getVendor(id: string): Promise<Vendor> {
  const res = await client.get<SingleResponse<Vendor>>(`/vendors/${id}`);
  return res.data.data;
}

export async function verifyVendor(
  id: string,
  status: VendorStatus,
  rejectionReason?: string
): Promise<Vendor> {
  const res = await client.patch<SingleResponse<Vendor>>(`/vendors/${id}/verify`, { status, rejectionReason });
  return res.data.data;
}

export async function deleteVendor(id: string): Promise<{ message: string }> {
  const res = await client.delete<SingleResponse<{ message: string }>>(`/vendors/${id}`);
  return res.data.data;
}

export async function getVendorDetail(id: string) {
  const res = await client.get<SingleResponse<any>>(`/vendors/${id}/detail`);
  return res.data.data;
}

export async function resetVendorCode(id: string): Promise<Vendor> {
  const res = await client.post<SingleResponse<Vendor>>(`/vendors/${id}/reset-vendor-code`);
  return res.data.data;
}

export async function updateVendorLocation(
  id: string,
  data: {
    latitude?: number;
    longitude?: number;
    address?: string;
    city?: string;
    state?: string;
  }
): Promise<Vendor> {
  const res = await client.patch<SingleResponse<Vendor>>(`/vendors/${id}/location`, data);
  return res.data.data;
}
