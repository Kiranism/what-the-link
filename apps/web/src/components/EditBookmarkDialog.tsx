import { useEffect, useState } from "react";
import type { Bookmark } from "@bookmark/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@bookmark/ui/components/dialog";
import { Button } from "@bookmark/ui/components/button";
import { Input } from "@bookmark/ui/components/input";
import { Badge } from "@bookmark/ui/components/badge";
import { updateBookmark } from "../utils/api";

interface EditBookmarkDialogProps {
  bookmark: Bookmark | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditBookmarkDialog({
  bookmark,
  open,
  onOpenChange,
}: EditBookmarkDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (bookmark && open) {
      setTitle(bookmark.title ?? "");
      setDescription(bookmark.description ?? "");
      const t = Array.isArray(bookmark.tags) ? bookmark.tags : [];
      setTags(t);
      setTagsInput("");
    }
  }, [bookmark, open]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!bookmark) throw new Error("No bookmark");
      return updateBookmark(bookmark.id, {
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        tags,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast.success("Bookmark updated");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Failed to update bookmark");
    },
  });

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagsInput("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagsInput);
    } else if (e.key === "Backspace" && tagsInput === "" && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  }

  if (!bookmark) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit bookmark</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 pt-2">
          {/* URL (read-only) */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              URL
            </label>
            <p className="text-sm text-foreground/70 truncate">{bookmark.url}</p>
          </div>

          {/* Title */}
          <div>
            <label
              htmlFor="edit-title"
              className="text-xs font-medium text-muted-foreground mb-1 block"
            >
              Title
            </label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bookmark title"
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="edit-description"
              className="text-xs font-medium text-muted-foreground mb-1 block"
            >
              Description
            </label>
            <textarea
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description..."
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                  >
                    <XIcon className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={() => {
                if (tagsInput.trim()) addTag(tagsInput);
              }}
              placeholder="Type a tag and press Enter..."
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
