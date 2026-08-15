import client from "./client";

export async function sendNotification(data: {
  userId?: string;
  title: string;
  body?: string;
  type?: string;
}) {
  const res = await client.post("/admin/notifications/send", data);
  return res.data;
}

export async function sendToRole(data: {
  role: string;
  title: string;
  body?: string;
  type?: string;
}) {
  const res = await client.post("/admin/notifications/send-to-role", data);
  return res.data;
}

export async function sendToCity(data: {
  city: string;
  title: string;
  body?: string;
  type?: string;
}) {
  const res = await client.post("/admin/notifications/send-to-city", data);
  return res.data;
}

export async function sendToCategory(data: {
  category: string;
  title: string;
  body?: string;
  type?: string;
}) {
  const res = await client.post("/admin/notifications/send-to-category", data);
  return res.data;
}

export async function getTemplates() {
  const res = await client.get("/admin/notifications/templates");
  return res.data.data;
}

export async function createTemplate(data: {
  name: string;
  title: string;
  body?: string;
  type?: string;
  variables?: string[];
}) {
  const res = await client.post("/admin/notifications/templates", data);
  return res.data;
}

export async function updateTemplate(id: string, data: Partial<{
  name: string;
  title: string;
  body: string;
  type: string;
  variables: string[];
}>) {
  const res = await client.patch(`/admin/notifications/templates/${id}`, data);
  return res.data;
}

export async function deleteTemplate(id: string) {
  await client.delete(`/admin/notifications/templates/${id}`);
}

export async function sendFromTemplate(data: {
  templateId: string;
  target: { type: string; value?: string };
  variables?: Record<string, string>;
}) {
  const res = await client.post("/admin/notifications/send-from-template", data);
  return res.data;
}

export async function getAdminNotificationList(params?: { page?: number; limit?: number }) {
  const res = await client.get("/admin/notifications/admin-list", { params });
  return res.data;
}
