import type { Bookmark } from "@bookmark/types";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@bookmark/ui/components/empty";
import { Badge } from "@bookmark/ui/components/badge";
import { SparklesIcon } from "lucide-react";
import { BookmarkCard } from "./BookmarkCard";

interface BookmarkGridProps {
  bookmarks: Bookmark[];
  total: number;
}

export function BookmarkGrid({ bookmarks, total }: BookmarkGridProps) {
  if (bookmarks.length === 0) {
    return (
      <Empty className="border border-dashed border-border bg-card/60 py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SparklesIcon />
          </EmptyMedia>
          <EmptyTitle>No bookmarks yet</EmptyTitle>
          <EmptyDescription>
            Send a link through WhatsApp or finish setup to start building your
            reading stack automatically.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
        Showing {bookmarks.length} of {total}
        </p>
        <Badge variant="outline">{bookmarks.length} visible</Badge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 [&>*]:[content-visibility:auto]">
        {bookmarks.map((bookmark) => (
          <BookmarkCard key={bookmark.id} bookmark={bookmark} />
        ))}
      </div>
    </div>
  );
}
