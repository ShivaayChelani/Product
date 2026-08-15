"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { monetizationApi } from "@/services/monetization";
import { useNotification } from "@/components/Notification";

export default function CouponsPage() {
  const { notify } = useNotification();
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [type, setType] = useState("PERCENTAGE");
  const [value, setValue] = useState("10");
  const [recipientEmail, setRecipientEmail] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await monetizationApi.listCoupons();
      setCoupons((res.data as any).data || []);
    } catch {
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    try {
      await monetizationApi.createCoupon({
        code,
        type,
        value: Number(value),
        recipientEmail: recipientEmail.trim() || undefined,
      });
      notify("success", "Coupon created");
      setCode("");
      setRecipientEmail("");
      load();
    } catch (e: any) {
      notify("error", e?.response?.data?.message || "Failed");
    }
  };

  const remove = async (id: string) => {
    try {
      await monetizationApi.deleteCoupon(id);
      notify("success", "Deleted");
      load();
    } catch {
      notify("error", "Failed to delete");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Coupons</h1>
        <p className="text-sm text-gray-500">Admin-created platform coupons (percentage, flat, BOGO).</p>
      </div>
      <div className="flex flex-wrap gap-2 rounded-xl border bg-white p-4">
        <input placeholder="CODE" className="rounded border px-3 py-2" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <select className="rounded border px-3 py-2" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="PERCENTAGE">Percentage</option>
          <option value="FLAT">Flat</option>
          <option value="BOGO">BOGO</option>
        </select>
        <input placeholder="Value" className="rounded border px-3 py-2 w-28" value={value} onChange={(e) => setValue(e.target.value)} />
        <input placeholder="Recipient Email (Optional)" className="rounded border px-3 py-2 w-64" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} />
        <button onClick={create} className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-4 py-2 text-white text-sm font-semibold"><Plus size={16} /> Create</button>
      </div>
      <div className="rounded-xl border bg-white overflow-hidden">
        {loading ? <div className="p-6 text-gray-500">Loading…</div> : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Gifted To</th>
                <th className="px-4 py-3">Used</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-3 font-semibold">{c.code}</td>
                  <td className="px-4 py-3">{c.type}</td>
                  <td className="px-4 py-3">{c.value}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.recipientEmail || "Everyone"}</td>
                  <td className="px-4 py-3">{c.usedCount}{c.usageLimit != null ? ` / ${c.usageLimit}` : ""}</td>
                  <td className="px-4 py-3"><button onClick={() => remove(c.id)} className="text-red-600"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
