import { memo } from "react";
import type { Bookmark } from "@bookmark/types";
import { ExternalLinkIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@bookmark/ui/components/button";
import { Badge } from "@bookmark/ui/components/badge";
import { CopyButton } from "@bookmark/ui/components/animate-ui/components/buttons/copy";
import {
  Collapsible,
  CollapsiblePanel,
} from "@bookmark/ui/components/collapsible";
import { Frame, FrameHeader, FramePanel } from "@bookmark/ui/components/frame";
import { dateFormatter } from "../utils/formatters";
import { toast } from "sonner";

interface BookmarkRowProps {
  bookmark: Bookmark;
  isFocused: boolean;
  isCopied?: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onOpenLink: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
  onEdit: (bookmark: Bookmark) => void;
  isPendingDelete: boolean;
}

export const BookmarkRow = memo(function BookmarkRow({
  bookmark,
  isFocused,
  isCopied,
  isExpanded,
  onToggleExpanded,
  onOpenLink,
  onDelete,
  onEdit,
  isPendingDelete,
}: BookmarkRowProps) {
  const tags = Array.isArray(bookmark.tags) ? bookmark.tags : [];

  return (
    <Frame
      id={`bookmark-row-${bookmark.id}`}
      role="option"
      aria-selected={isFocused}
      aria-label={`${bookmark.title || bookmark.url}`}
      className={`w-full group/row bg-muted/40 p-0.5 sm:p-1 rounded-lg sm:rounded-2xl transition-[background-color] duration-150 ${isFocused ? "bg-muted!" : "hover:bg-muted!"}`}
      data-bookmark-row
    >
      <Collapsible open={isExpanded} onOpenChange={onToggleExpanded}>
        {/* Desktop: single row layout */}
        <FrameHeader
          className="hidden sm:flex cursor-pointer flex-row items-center justify-between gap-4 px-5 py-3"
          onClick={onToggleExpanded}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {bookmark.favicon ? (
              <img
                src={bookmark.favicon}
                alt=""
                width={16}
                height={16}
                className="size-4 shrink-0 rounded-sm"
                loading="lazy"
              />
            ) : (
              <div className="size-4 shrink-0 rounded-sm bg-muted" />
            )}
            <a
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-sm font-medium text-foreground no-underline hover:text-primary hover:no-underline"
              onClick={(event) => event.stopPropagation()}
            >
              {bookmark.title || bookmark.url}
            </a>
            {tags.length > 0 && (
              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                {tags.slice(0, 2).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                    {tag}
                  </Badge>
                ))}
                {tags.length > 2 && (
                  <span className="text-[10px] text-muted-foreground">+{tags.length - 2}</span>
                )}
              </div>
            )}
            <span className="truncate text-xs text-muted-foreground/60 shrink-0">
              {bookmark.domain}
            </span>
          </div>

          <div className="relative flex items-center shrink-0 min-w-[7.5rem] justify-end">
            <span
              className={`text-muted-foreground text-xs whitespace-nowrap transition-opacity group-hover/row:opacity-0 group-focus-within/row:opacity-0 ${isFocused ? "opacity-0" : ""}`}
            >
              {dateFormatter.format(new Date(String(bookmark.createdAt)))}
            </span>

            <div
              className={`absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-0.5 transition-opacity ${isFocused ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none group-hover/row:opacity-100 group-hover/row:pointer-events-auto group-focus-within/row:opacity-100 group-focus-within/row:pointer-events-auto"}`}
              onClick={(event) => event.stopPropagation()}
            >
              <CopyButton
                content={bookmark.url}
                copied={isCopied || undefined}
                delay={1000}
                variant="ghost"
                size="xs"
                className="size-7 text-muted-foreground hover:text-foreground"
                aria-label="Copy link"
                onCopiedChange={(copied) => {
                  if (copied) toast.success("Link copied to clipboard");
                }}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7 text-muted-foreground hover:text-foreground"
                aria-label="Edit bookmark"
                onClick={() => onEdit(bookmark)}
              >
                <PencilIcon aria-hidden="true" className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7 text-muted-foreground hover:text-foreground"
                aria-label="Open link"
                onClick={() => onOpenLink(bookmark)}
              >
                <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-7 text-muted-foreground hover:text-destructive"
                aria-label="Delete bookmark"
                disabled={isPendingDelete}
                onClick={() => onDelete(bookmark)}
              >
                <Trash2Icon aria-hidden="true" className="size-3.5" />
              </Button>
            </div>
          </div>
        </FrameHeader>

        {/* Mobile: stacked layout */}
        <div className="sm:hidden">
          <div
            className="flex items-start gap-2 px-3 pt-2.5 pb-1 cursor-pointer"
            onClick={onToggleExpanded}
          >
            {bookmark.favicon ? (
              <img
                src={bookmark.favicon}
                alt=""
                width={20}
                height={20}
                className="size-5 shrink-0 rounded-sm mt-0.5"
                loading="lazy"
              />
            ) : (
              <div className="size-5 shrink-0 rounded-sm bg-muted-foreground/20 mt-0.5" />
            )}
            <div className="flex flex-col min-w-0 gap-0.5 flex-1">
              <span className="line-clamp-2 text-[13px] font-medium text-foreground break-words leading-snug">
                {bookmark.title || bookmark.url}
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-muted-foreground">
                  {bookmark.domain}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  · {dateFormatter.format(new Date(String(bookmark.createdAt)))}
                </span>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0 h-[18px]">
                      {tag}
                    </Badge>
                  ))}
                  {tags.length > 3 && (
                    <span className="text-[9px] text-muted-foreground self-center">+{tags.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* Actions bar — always visible */}
          <div className="flex items-center justify-end gap-0.5 px-2 pb-1.5">
            <CopyButton
              content={bookmark.url}
              copied={isCopied || undefined}
              delay={1000}
              variant="ghost"
              size="xs"
              className="size-8 text-muted-foreground"
              aria-label="Copy link"
              onCopiedChange={(copied) => {
                if (copied) toast.success("Link copied to clipboard");
              }}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8 text-muted-foreground"
              aria-label="Edit bookmark"
              onClick={() => onEdit(bookmark)}
            >
              <PencilIcon aria-hidden="true" className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8 text-muted-foreground"
              aria-label="Open link"
              onClick={() => onOpenLink(bookmark)}
            >
              <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8 text-muted-foreground"
              aria-label="Delete bookmark"
              disabled={isPendingDelete}
              onClick={() => onDelete(bookmark)}
            >
              <Trash2Icon aria-hidden="true" className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Expanded description + AI summary */}
        <CollapsiblePanel>
          <FramePanel className="px-2.5 py-2.5 sm:px-5 sm:py-5 space-y-2 sm:space-y-3">
            {bookmark.summary ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground/70 mb-1">AI Summary</p>
                <p className="text-foreground/80 text-xs sm:text-sm leading-5 sm:leading-6 whitespace-pre-wrap break-words">
                  {bookmark.summary}
                </p>
              </div>
            ) : bookmark.summaryStatus === "pending" ? (
              <p className="text-muted-foreground text-xs sm:text-sm italic">
                Generating summary...
              </p>
            ) : null}
            {bookmark.description ? (
              <p className="text-muted-foreground text-xs sm:text-sm leading-5 sm:leading-6 whitespace-pre-wrap break-words">
                {bookmark.description}
              </p>
            ) : !bookmark.summary && bookmark.summaryStatus !== "pending" ? (
              <p className="text-muted-foreground text-xs sm:text-sm italic">
                No description available
              </p>
            ) : null}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </FramePanel>
        </CollapsiblePanel>
      </Collapsible>
    </Frame>
  );
});
