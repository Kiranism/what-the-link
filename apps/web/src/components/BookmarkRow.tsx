import { memo } from "react";
import type { Bookmark } from "@bookmark/types";
import { ExternalLinkIcon, Trash2Icon } from "lucide-react";
import { Button } from "@bookmark/ui/components/button";
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
  isPendingDelete,
}: BookmarkRowProps) {
  return (
    <Frame
      id={`bookmark-row-${bookmark.id}`}
      role="option"
      aria-selected={isFocused}
      aria-label={`${bookmark.title || bookmark.url}${bookmark.isRead ? "" : ", unread"}`}
      className={`w-full group/row bg-muted/40 p-0 sm:p-1 rounded-xl sm:rounded-2xl transition-[background-color] duration-150 ${isFocused ? "bg-muted!" : "hover:bg-muted!"}`}
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
            <span className="truncate text-xs text-muted-foreground/60 shrink-0">
              {bookmark.domain}
            </span>
          </div>

          <div className="relative flex items-center shrink-0 min-w-[5.75rem] justify-end">
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
        <div
          className="flex sm:hidden flex-col gap-2 px-3 py-2.5 cursor-pointer"
          onClick={onToggleExpanded}
        >
          {/* Favicon + title + domain */}
          <div className="flex items-start gap-2.5 min-w-0">
            {bookmark.favicon ? (
              <img
                src={bookmark.favicon}
                alt=""
                width={24}
                height={24}
                className="size-6 shrink-0 rounded-sm mt-0.5"
                loading="lazy"
              />
            ) : (
              <div className="size-6 shrink-0 rounded-sm bg-muted-foreground/20 mt-0.5" />
            )}
            <div className="flex flex-col min-w-0 gap-0.5">
              <a
                href={bookmark.url}
                target="_blank"
                rel="noopener noreferrer"
                className="line-clamp-2 text-sm font-medium text-foreground no-underline hover:text-primary hover:no-underline break-words"
                onClick={(event) => event.stopPropagation()}
              >
                {bookmark.title || bookmark.url}
              </a>
              <span className="truncate text-xs text-muted-foreground">
                {bookmark.domain}
              </span>
            </div>
          </div>

          {/* Date + actions */}
          <div className="flex items-center justify-between -mx-1">
            <span className="text-muted-foreground text-xs ml-1">
              {dateFormatter.format(new Date(String(bookmark.createdAt)))}
            </span>
            <div
              className="flex items-center"
              onClick={(event) => event.stopPropagation()}
            >
              <CopyButton
                content={bookmark.url}
                copied={isCopied || undefined}
                delay={1000}
                variant="ghost"
                size="xs"
                className="size-8 text-muted-foreground hover:text-foreground"
                aria-label="Copy link"
                onCopiedChange={(copied) => {
                  if (copied) toast.success("Link copied to clipboard");
                }}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-8 text-muted-foreground hover:text-foreground"
                aria-label="Open link"
                onClick={() => onOpenLink(bookmark)}
              >
                <ExternalLinkIcon aria-hidden="true" className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-8 text-muted-foreground hover:text-destructive"
                aria-label="Delete bookmark"
                disabled={isPendingDelete}
                onClick={() => onDelete(bookmark)}
              >
                <Trash2Icon aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Expanded description */}
        <CollapsiblePanel>
          <FramePanel className="px-3 py-3 sm:px-5 sm:py-5">
            {bookmark.description ? (
              <p className="text-muted-foreground text-xs sm:text-sm leading-5 sm:leading-6 whitespace-pre-wrap break-words">
                {bookmark.description}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs sm:text-sm italic">
                No description available
              </p>
            )}
          </FramePanel>
        </CollapsiblePanel>
      </Collapsible>
    </Frame>
  );
});
