export interface CreateBookmarkBody {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
  tags?: string[];
}

export interface UpdateBookmarkBody {
  title?: string;
  description?: string;
  tags?: string[];

  isArchived?: boolean;
  isRead?: boolean;
}
