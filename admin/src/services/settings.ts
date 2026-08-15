import client from "./client";

export async function getSettings() {
  const res = await client.get("/settings");
  return res.data.data;
}

export async function getSettingCategories() {
  const res = await client.get("/settings/categories");
  return res.data.data;
}

export async function getSettingsByCategory(category: string) {
  const res = await client.get(`/settings/category/${category}`);
  return res.data.data;
}

export async function updateSetting(key: string, value: unknown) {
  const res = await client.patch(`/settings/${key}`, { value });
  return res.data.data;
}

export async function bulkUpdateSettings(updates: { key: string; value: unknown }[]) {
  const res = await client.post("/settings/bulk-update", { updates });
  return res.data.data;
}

export async function resetSettings() {
  const res = await client.post("/settings/reset-defaults");
  return res.data.data;
}
