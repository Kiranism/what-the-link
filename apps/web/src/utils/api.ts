import type { Bookmark, BookmarkListResponse } from "@bookmark/types";
import type { CreateBookmarkBody, UpdateBookmarkBody } from "@bookmark/types/api";

const API_BASE = (import.meta.env.VITE_SERVER_URL ?? "") + "/api";

function authFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

export interface FetchBookmarksParams {
  search?: string;
  tags?: string[];
  domain?: string;

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

  if (params.archived) searchParams.set("archived", "true");
  if (params.limit != null) searchParams.set("limit", String(params.limit));
  if (params.offset != null) searchParams.set("offset", String(params.offset));

  const res = await authFetch(`${API_BASE}/bookmarks?${searchParams}`);
  if (!res.ok) throw new Error("Failed to fetch bookmarks");
  return res.json();
}

export async function fetchBookmark(id: number): Promise<Bookmark> {
  const res = await authFetch(`${API_BASE}/bookmarks/${id}`);
  if (!res.ok) throw new Error("Failed to fetch bookmark");
  return res.json();
}

export async function createBookmark(
  body: CreateBookmarkBody,
): Promise<Bookmark> {
  const res = await authFetch(`${API_BASE}/bookmarks`, {
    method: "POST",
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
  const res = await authFetch(`${API_BASE}/bookmarks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update bookmark");
  return res.json();
}

export async function deleteBookmark(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/bookmarks/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete bookmark");
}

export interface TagCount {
  tag: string;
  count: number;
}

export async function fetchTags(): Promise<TagCount[]> {
  const res = await authFetch(`${API_BASE}/bookmarks/tags`);
  if (!res.ok) throw new Error("Failed to fetch tags");
  const data = (await res.json()) as { tags: TagCount[] };
  return data.tags ?? [];
}

export type BulkAction = "archive" | "unarchive" | "delete" | "addTags";

export async function bulkUpdateBookmarks(
  ids: number[],
  action: BulkAction,
  tags?: string[],
): Promise<{ success: boolean; affected: number }> {
  const res = await authFetch(`${API_BASE}/bookmarks/bulk`, {
    method: "POST",
    body: JSON.stringify({ ids, action, tags }),
  });
  if (!res.ok) throw new Error("Bulk operation failed");
  return res.json();
}


export interface ImportResult {
  total: number;
  imported: number;
  duplicates: number;
  failed: number;
}

export async function importBookmarks(file: File): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/bookmarks/import`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Import failed");
  }
  return res.json();
}

export interface ImportStatusResponse {
  import: {
    state: "idle" | "importing" | "complete" | "error";
    progress?: { done: number; total: number };
    result?: ImportResult;
    error?: string;
    startedAt?: number;
    completedAt?: number;
  };
  enrichment: Record<string, number>;
}

export async function getImportStatus(): Promise<ImportStatusResponse> {
  const res = await authFetch(`${API_BASE}/bookmarks/import/status`);
  if (!res.ok) throw new Error("Failed to get import status");
  return res.json();
}

export async function retryAiEnrichment(): Promise<{ reset: number }> {
  const res = await authFetch(`${API_BASE}/bookmarks/retry-ai`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to retry AI enrichment");
  return res.json();
}

export async function dismissImportStatus(): Promise<void> {
  const res = await authFetch(`${API_BASE}/bookmarks/import/status`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to dismiss import status");
}

export async function refreshBookmarkMetadata(id: number): Promise<Bookmark> {
  const res = await authFetch(`${API_BASE}/bookmarks/${id}/refresh-metadata`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to refresh metadata");
  return res.json();
}

export async function getWhatsAppStatus(): Promise<{
  connected: boolean;
  phoneNumber?: string;
  lastDisconnectCode?: number;
}> {
  const res = await authFetch(`${API_BASE}/whatsapp/status`);
  if (!res.ok) throw new Error("Failed to get WhatsApp status");
  return res.json();
}

export async function reconnectWhatsApp(): Promise<void> {
  const res = await authFetch(`${API_BASE}/whatsapp/reconnect`, {
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
  const res = await authFetch(`${API_BASE}/whatsapp/qr`);
  if (!res.ok) throw new Error("Failed to get QR");
  return res.json();
}

export interface AppSettings {
  waAllowedGroupJid: string | null;
  digestEnabled: boolean;
  digestHour: number;
}

export async function fetchSettings(): Promise<AppSettings> {
  const res = await authFetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

export async function updateSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const res = await authFetch(`${API_BASE}/settings`, {
    method: "PATCH",
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
  const res = await authFetch(`${API_BASE}/settings/whatsapp-groups`);
  if (!res.ok) throw new Error("Failed to fetch WhatsApp groups");
  const data = (await res.json()) as { groups: WhatsAppGroup[] };
  return data.groups ?? [];
}

export async function refreshWhatsAppGroups(): Promise<WhatsAppGroup[]> {
  const res = await authFetch(`${API_BASE}/settings/whatsapp-groups/refresh`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to refresh WhatsApp groups");
  const data = (await res.json()) as { groups: WhatsAppGroup[] };
  return data.groups ?? [];
}
