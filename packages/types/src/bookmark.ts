export interface Bookmark {
  id: number;
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  favicon: string | null;
  domain: string;
  tags: string[];
  isArchived: boolean;

  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
  source: string;
  whatsappMessageId: string | null;
}

export interface BookmarkListResponse {
  bookmarks: Bookmark[];
  total: number;
  limit: number;
  offset: number;
}
