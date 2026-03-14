import { useEffect, useState } from "react";
import type { Bookmark } from "@bookmark/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDeleteBookmarkMutation } from "../hooks/useBookmarkMutations";
import {
  ExternalLinkIcon,
  PencilIcon,
  RefreshCwIcon,
  TagIcon,
  Trash2Icon,
} from "lucide-react";
import { CopyButton } from "@bookmark/ui/components/animate-ui/components/buttons/copy";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@bookmark/ui/components/alert-dialog";
import { Badge } from "@bookmark/ui/components/badge";
import { Button } from "@bookmark/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@bookmark/ui/components/card";
import { Input } from "@bookmark/ui/components/input";
import { updateBookmark, refreshBookmarkMetadata } from "../utils/api";
import { dateFormatter } from "../utils/formatters";

interface BookmarkCardProps {
  bookmark: Bookmark;
}

export function BookmarkCard({ bookmark }: BookmarkCardProps) {
  const [isEditingTags, setIsEditingTags] = useState(false);
  const [tagsInput, setTagsInput] = useState(
    Array.isArray(bookmark.tags) ? bookmark.tags.join(", ") : "",
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const queryClient = useQueryClient();

  // Sync tagsInput when bookmark.tags changes (e.g. after server refetch)
  const tagsKey = Array.isArray(bookmark.tags) ? bookmark.tags.join(",") : "";
  useEffect(() => {
    if (!isEditingTags) {
      setTagsInput(Array.isArray(bookmark.tags) ? bookmark.tags.join(", ") : "");
    }
  }, [tagsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteMutation = useDeleteBookmarkMutation();

  const tagsMutation = useMutation({
    mutationFn: () =>
      updateBookmark(bookmark.id, {
        tags: tagsInput
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      setIsEditingTags(false);
    },
  });

  const refreshMutation = useMutation({
    mutationFn: () => refreshBookmarkMetadata(bookmark.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });

  const tags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
  const savedAt = dateFormatter.format(new Date(String(bookmark.createdAt)));
  const needsMetadataRefresh = !bookmark.title || bookmark.title === bookmark.url;

  return (
    <>
      <Card
        size="sm"
        className="border border-border/80 bg-card/85 shadow-sm shadow-primary/5 transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10"
      >
        {bookmark.image ? (
          <a
            href={bookmark.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group block aspect-[16/10] overflow-hidden border-b border-border/70 bg-muted"
          >
            <img
              src={bookmark.image}
              alt={bookmark.title ?? ""}
              width={320}
              height={200}
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
            />
          </a>
        ) : (
          <div className="flex aspect-[16/10] items-end border-b border-border/70 bg-[linear-gradient(135deg,rgba(94,234,212,0.12),rgba(59,130,246,0.12),rgba(251,191,36,0.12))] p-3">
            <Badge variant="secondary">{bookmark.domain}</Badge>
          </div>
        )}
        <CardHeader className="grid-cols-[1fr_auto] gap-2">
          <div className="flex items-start gap-3">
            {bookmark.favicon ? (
              <img src={bookmark.favicon} alt="" width={20} height={20} className="mt-0.5 size-5 shrink-0" />
            ) : (
              <div className="mt-0.5 size-5 shrink-0 border bg-secondary" />
            )}
            <div className="min-w-0">
              <CardTitle className="line-clamp-2 text-sm leading-5">
                <a
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="no-underline hover:no-underline hover:text-primary"
                >
                  {bookmark.title || bookmark.url}
                </a>
              </CardTitle>
              <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                <span>{bookmark.domain}</span>
                <span className="text-border">•</span>
                <span>Saved {savedAt}</span>
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <CopyButton
              content={bookmark.url}
              variant="outline"
              size="sm"
              aria-label="Copy link"
              onCopiedChange={(copied) => {
                if (copied) toast.success("Link copied to clipboard");
              }}
            />
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => window.open(bookmark.url, "_blank", "noopener,noreferrer")}
              aria-label="Open bookmark"
            >
              <ExternalLinkIcon />
            </Button>
            {needsMetadataRefresh && (
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => refreshMutation.mutate()}
                aria-label="Refresh metadata"
                disabled={refreshMutation.isPending}
              >
                <RefreshCwIcon className={refreshMutation.isPending ? "animate-spin" : ""} />
              </Button>
            )}
            <Button
              variant="destructive"
              size="icon-sm"
              onClick={() => setShowDeleteDialog(true)}
              aria-label="Delete bookmark"
              disabled={deleteMutation.isPending}
            >
              <Trash2Icon />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {bookmark.description ? (
            <p className="line-clamp-3 text-muted-foreground text-sm leading-6">
              {bookmark.description}
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              No description was captured for this link yet.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{bookmark.source}</Badge>
            {tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
            {!tags.length ? (
              <Badge variant="outline">
                <TagIcon data-icon="inline-start" />
                Untagged
              </Badge>
            ) : null}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-stretch gap-3">
          {isEditingTags ? (
            <>
              <Input
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                placeholder="design, reading, inspiration…"
                aria-label="Bookmark tags"
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsEditingTags(false);
                    setTagsInput(tags.join(", "));
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => tagsMutation.mutate()}
                  disabled={tagsMutation.isPending}
                >
                  Save tags
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs">
                Keep tags short so search stays fast.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingTags(true)}
              >
                <PencilIcon data-icon="inline-start" />
                Edit tags
              </Button>
            </div>
          )}
        </CardFooter>
      </Card>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete bookmark</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              {bookmark.title
                ? `\u201c${bookmark.title}\u201d`
                : "this bookmark"}
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                deleteMutation.mutate(bookmark.id);
                setShowDeleteDialog(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
