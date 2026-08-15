"use client";

import { useEffect, useState, use, useRef, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Save, X, Edit3, Eye, Trash2, Upload } from "lucide-react";
import { getCampaignById, getClaims, updateClaimStatus, updateCampaign, formatCampaignApiError, type Campaign, type CampaignClaim, type CampaignFormState } from "@/services/campaigns";
import { uploadImage } from "@/services/places";
import { useNotification } from "@/components/Notification";

export default function CampaignDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [claims, setClaims] = useState<CampaignClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<CampaignFormState>({
    name: "",
    description: "",
    imageUrl: "",
    pointsRequired: "",
    totalWinnerSlots: "",
    remainingWinnerSlots: "",
    maxClaimsPerUser: "",
    startDate: "",
    endDate: "",
    termsAndConditions: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { notify } = useNotification();

  const fetchData = useCallback(async () => {
    try {
      const [campRes, claimsRes] = await Promise.all([
        getCampaignById(resolvedParams.id),
        getClaims({ campaignId: resolvedParams.id }),
      ]);
      setCampaign(campRes.data);
      setClaims(claimsRes.data);
    } catch {
      notify("error", "Failed to load campaign details");
    } finally {
      setLoading(false);
    }
  }, [resolvedParams.id, notify]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleStatusChange = async (claimId: string, status: string) => {
    try {
      await updateClaimStatus(claimId, status);
      notify("success", "Claim status updated");
      fetchData();
    } catch {
      notify("error", "Failed to update claim status");
    }
  };

  const handleCampaignStatusChange = async (status: Campaign["status"]) => {
    try {
      await updateCampaign(resolvedParams.id, { status });
      notify("success", `Campaign status updated to ${status}`);
      fetchData();
    } catch {
      notify("error", "Failed to update campaign status");
    }
  };

  const startEditing = () => {
    if (!campaign) return;
    setForm({
      name: campaign.name,
      description: campaign.description,
      imageUrl: campaign.imageUrl || "",
      pointsRequired: campaign.pointsRequired,
      totalWinnerSlots: campaign.totalWinnerSlots,
      remainingWinnerSlots: Math.max(0, campaign.remainingWinnerSlots ?? 0),
      maxClaimsPerUser: campaign.maxClaimsPerUser,
      startDate: campaign.startDate ? new Date(campaign.startDate).toISOString().slice(0, 16) : "",
      endDate: campaign.endDate ? new Date(campaign.endDate).toISOString().slice(0, 16) : "",
      termsAndConditions: campaign.termsAndConditions || "",
    });
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const totalSlots = Math.max(1, Number(form.totalWinnerSlots) || 1);
      const remainingSlots = Math.max(0, Number(form.remainingWinnerSlots) || 0);
      const start = new Date(form.startDate);
      const end = new Date(form.endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        notify("error", "Start and end dates are required");
        return;
      }
      if (!form.name?.trim() || form.name.trim().length < 3) {
        notify("error", "Name must be at least 3 characters");
        return;
      }
      if (!form.description?.trim() || form.description.trim().length < 10) {
        notify("error", "Description must be at least 10 characters");
        return;
      }
      const payload: Record<string, unknown> = {
        name: String(form.name).trim(),
        description: String(form.description).trim(),
        pointsRequired: Number(form.pointsRequired),
        totalWinnerSlots: totalSlots,
        remainingWinnerSlots: Math.min(remainingSlots, totalSlots),
        maxClaimsPerUser: Math.max(1, Number(form.maxClaimsPerUser) || 1),
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        imageUrl: form.imageUrl?.trim() ? String(form.imageUrl).trim() : null,
        termsAndConditions: form.termsAndConditions?.trim()
          ? String(form.termsAndConditions).trim()
          : null,
      };
      if (!Number.isFinite(payload.pointsRequired as number) || (payload.pointsRequired as number) < 1) {
        notify("error", "Points required must be a positive number");
        return;
      }
      await updateCampaign(resolvedParams.id, payload);
      notify("success", "Campaign updated");
      setEditing(false);
      fetchData();
    } catch (err: unknown) {
      notify("error", formatCampaignApiError(err, "Failed to update campaign"));
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const url = await uploadImage(file);
      setForm((p) => ({ ...p, imageUrl: url }));
      notify("success", "Image uploaded");
    } catch {
      notify("error", "Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = () => {
    setForm((p) => ({ ...p, imageUrl: "" }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  if (loading) return <div>Loading...</div>;
  if (!campaign) return <div>Campaign not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/campaigns" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={20} className="text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
            <p className="text-sm text-gray-500">Campaign Details & Claims</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!editing ? (
            <>
              <button onClick={startEditing} className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
                <Edit3 size={16} /> Edit
              </button>
              {campaign.status !== "ACTIVE" && (
                <button onClick={() => handleCampaignStatusChange("ACTIVE")} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700">
                  Activate
                </button>
              )}
              {campaign.status === "ACTIVE" && (
                <button onClick={() => handleCampaignStatusChange("PAUSED")} className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600">
                  Pause
                </button>
              )}
            </>
          ) : (
            <>
              <button onClick={() => setEditing(false)} className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
                <Eye size={16} /> Preview
              </button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                <Save size={16} /> {saving ? "Saving..." : "Save Changes"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {!editing ? (
          <div className="col-span-1 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Campaign Info</h3>
              {campaign.imageUrl && (
                <img src={campaign.imageUrl} alt="" className="w-full h-48 object-cover rounded-lg mb-4" />
              )}
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-gray-500 text-xs font-medium block mb-1">Description</span>
                  <p className="text-gray-700 text-sm leading-relaxed">{campaign.description}</p>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-500">Status</span>
                  <span className="font-medium text-gray-900">{campaign.status}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-500">Points Required</span>
                  <span className="font-medium text-gray-900">{campaign.pointsRequired.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-500">Slots (Left / Total)</span>
                  <span className={`font-medium ${campaign.remainingWinnerSlots < 0 ? "text-red-600" : "text-gray-900"}`}>
                    {campaign.remainingWinnerSlots} / {campaign.totalWinnerSlots}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-500">Max Claims / User</span>
                  <span className="font-medium text-gray-900">{campaign.maxClaimsPerUser}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-500">Start</span>
                  <span className="font-medium text-gray-900">{new Date(campaign.startDate).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-500">End</span>
                  <span className="font-medium text-gray-900">{new Date(campaign.endDate).toLocaleDateString()}</span>
                </div>
                {campaign.termsAndConditions && (
                  <div>
                    <span className="text-gray-500 text-xs font-medium block mb-1">Terms & Conditions</span>
                    <p className="text-gray-600 text-xs leading-relaxed whitespace-pre-wrap">{campaign.termsAndConditions}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="col-span-1 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Edit Campaign</h3>
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Campaign Image</label>
                  {form.imageUrl ? (
                    <div className="space-y-2 mb-3">
                      <div className="relative w-full h-44 rounded-lg overflow-hidden border border-gray-200 group">
                        <div 
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full h-full cursor-pointer"
                          title="Click to change image"
                        >
                          <img src={form.imageUrl} alt="" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition flex items-center justify-center">
                            <span className="text-white text-xs font-medium px-2 py-1 bg-black/50 rounded opacity-0 group-hover:opacity-100 hover:opacity-100 transition">
                              Click to change image
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeImage();
                          }}
                          className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full text-white transition z-10 shadow"
                          title="Remove image"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-100 transition"
                        >
                          <Upload size={14} />
                          Change Image
                        </button>
                        <button
                          type="button"
                          onClick={removeImage}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-xs font-medium text-red-600 hover:bg-red-100 transition"
                        >
                          <Trash2 size={14} />
                          Remove Image
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50/30 transition mb-3"
                    >
                      <Upload size={28} className="text-gray-400 mb-2" />
                      <span className="text-sm text-gray-500 font-medium">
                        {uploading ? "Uploading..." : "Click to upload from local storage"}
                      </span>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} className="hidden" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
                  <input name="name" value={form.name} onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea name="description" value={form.description} onChange={handleChange} rows={4}
                    className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Points Required</label>
                    <input type="number" name="pointsRequired" value={form.pointsRequired} onChange={handleChange} min="1"
                      className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Claims / User</label>
                    <input type="number" name="maxClaimsPerUser" value={form.maxClaimsPerUser} onChange={handleChange} min="1"
                      className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Total Slots</label>
                    <input type="number" name="totalWinnerSlots" value={form.totalWinnerSlots} onChange={handleChange} min="1"
                      className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Remaining Slots</label>
                    <input type="number" name="remainingWinnerSlots" value={form.remainingWinnerSlots} onChange={handleChange} min="0"
                      className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                    <p className="mt-1 text-xs text-gray-500">Must be ≤ total. Fix negatives here (e.g. -54 → 1).</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input type="datetime-local" name="startDate" value={form.startDate} onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                    <input type="datetime-local" name="endDate" value={form.endDate} onChange={handleChange}
                      className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Terms & Conditions</label>
                  <textarea name="termsAndConditions" value={form.termsAndConditions} onChange={handleChange} rows={4}
                    className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-gray-900">Claims ({claims.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-gray-600 border-b">
                  <tr>
                    <th className="px-6 py-3 font-medium">User</th>
                    <th className="px-6 py-3 font-medium">Redemption ID</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {claims.map((claim) => (
                    <tr key={claim.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{claim.user?.name || "—"}</div>
                        <div className="text-xs text-gray-500">{claim.user?.email || "—"}</div>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">{claim.redemptionId || "—"}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
                          ${claim.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" :
                            claim.status === "PENDING" ? "bg-amber-100 text-amber-700" :
                            claim.status === "SHIPPED" ? "bg-blue-100 text-blue-700" :
                            claim.status === "DELIVERED" ? "bg-purple-100 text-purple-700" :
                            "bg-red-100 text-red-700"}`}>
                          {claim.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {new Date(claim.claimedAt || claim.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <select
                          value={claim.status}
                          onChange={(e) => handleStatusChange(claim.id, e.target.value)}
                          className="text-sm border rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="PENDING">PENDING</option>
                          <option value="APPROVED">APPROVED</option>
                          <option value="REJECTED">REJECTED</option>
                          <option value="SHIPPED">SHIPPED</option>
                          <option value="DELIVERED">DELIVERED</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                  {claims.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        No claims yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
