import type { Bookmark, BookmarkListResponse } from "@bookmark/types";
import type { CreateBookmarkBody, UpdateBookmarkBody } from "@bookmark/types/api";

const API_BASE = (import.meta.env.VITE_SERVER_URL ?? "") + "/api";

function getAuthHeaders(): HeadersInit {
  const password = localStorage.getItem("app_password");
  if (!password) {
    throw new Error("Not authenticated");
  }
  return {
    Authorization: `Bearer ${password}`,
    "Content-Type": "application/json",
  };
}

export interface FetchBookmarksParams {
  search?: string;
  tags?: string[];
  domain?: string;
  favorite?: boolean;
  unread?: boolean;
  archived?: boolean;
  limit?: number;
  offset?: number;
}

export async function fetchBookmarks(
  params: FetchBookmarksParams = {},
): Promise<BookmarkListResponse> {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set("search", params.search);
  if (params.tags?.length) searchParams.set("tag", params.tags.join(","));
  if (params.domain) searchParams.set("domain", params.domain);
  if (params.favorite) searchParams.set("favorite", "true");
  if (params.unread) searchParams.set("unread", "true");
  if (params.archived) searchParams.set("archived", "true");
  if (params.limit != null) searchParams.set("limit", String(params.limit));
  if (params.offset != null) searchParams.set("offset", String(params.offset));

  const res = await fetch(`${API_BASE}/bookmarks?${searchParams}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch bookmarks");
  return res.json();
}

export async function fetchBookmark(id: number): Promise<Bookmark> {
  const res = await fetch(`${API_BASE}/bookmarks/${id}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch bookmark");
  return res.json();
}

export async function createBookmark(
  body: CreateBookmarkBody,
): Promise<Bookmark> {
  const res = await fetch(`${API_BASE}/bookmarks`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Failed to create");
  }
  return res.json();
}

export async function updateBookmark(
  id: number,
  data: UpdateBookmarkBody,
): Promise<Bookmark> {
  const res = await fetch(`${API_BASE}/bookmarks/${id}`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update bookmark");
  return res.json();
}

export async function deleteBookmark(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/bookmarks/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete bookmark");
}

export interface TagCount {
  tag: string;
  count: number;
}

export async function fetchTags(): Promise<TagCount[]> {
  const res = await fetch(`${API_BASE}/bookmarks/tags`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch tags");
  const data = (await res.json()) as { tags: TagCount[] };
  return data.tags ?? [];
}

export type BulkAction = "archive" | "unarchive" | "favorite" | "unfavorite" | "markRead" | "delete" | "addTags";

export async function bulkUpdateBookmarks(
  ids: number[],
  action: BulkAction,
  tags?: string[],
): Promise<{ success: boolean; affected: number }> {
  const res = await fetch(`${API_BASE}/bookmarks/bulk`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ ids, action, tags }),
  });
  if (!res.ok) throw new Error("Bulk operation failed");
  return res.json();
}

export async function exportBookmarks(format: "json" | "html" = "json"): Promise<void> {
  const res = await fetch(`${API_BASE}/bookmarks/export?format=${format}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to export bookmarks");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = format === "html" ? "bookmarks.html" : "bookmarks.json";
  a.click();
  URL.revokeObjectURL(url);
}

export async function importBookmarks(
  data: { bookmarks: Array<{ url: string; title?: string; description?: string; tags?: string[] }> },
): Promise<{ success: boolean; imported: number; skipped: number }> {
  const res = await fetch(`${API_BASE}/bookmarks/import`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to import bookmarks");
  return res.json();
}

export async function refreshBookmarkMetadata(id: number): Promise<Bookmark> {
  const res = await fetch(`${API_BASE}/bookmarks/${id}/refresh-metadata`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to refresh metadata");
  return res.json();
}

export async function getWhatsAppStatus(): Promise<{
  connected: boolean;
  phoneNumber?: string;
  lastDisconnectCode?: number;
}> {
  const res = await fetch(`${API_BASE}/whatsapp/status`);
  if (!res.ok) throw new Error("Failed to get WhatsApp status");
  return res.json();
}

export async function reconnectWhatsApp(): Promise<void> {
  const res = await fetch(`${API_BASE}/whatsapp/reconnect`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to reconnect");
}

export async function getWhatsAppQR(): Promise<{
  qr: string | null;
  connected: boolean;
  phoneNumber?: string;
  message?: string;
}> {
  const res = await fetch(`${API_BASE}/whatsapp/qr`);
  if (!res.ok) throw new Error("Failed to get QR");
  return res.json();
}

export interface AppSettings {
  waAllowedGroupJid: string | null;
}

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch(`${API_BASE}/settings`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

export async function updateSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: "PATCH",
    headers: getAuthHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("Failed to update settings");
  return res.json();
}

export interface WhatsAppGroup {
  jid: string;
  name: string;
}

export async function fetchWhatsAppGroups(): Promise<WhatsAppGroup[]> {
  const res = await fetch(`${API_BASE}/settings/whatsapp-groups`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to fetch WhatsApp groups");
  const data = (await res.json()) as { groups: WhatsAppGroup[] };
  return data.groups ?? [];
}

export async function refreshWhatsAppGroups(): Promise<WhatsAppGroup[]> {
  const res = await fetch(`${API_BASE}/settings/whatsapp-groups/refresh`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Failed to refresh WhatsApp groups");
  const data = (await res.json()) as { groups: WhatsAppGroup[] };
  return data.groups ?? [];
}
