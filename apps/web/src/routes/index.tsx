import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useDeferredValue,
} from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type {
  ColumnDef,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { Bookmark } from "@bookmark/types";
import { SearchIcon, MessageCircle, BookmarkPlus } from "lucide-react";
import { Link } from "@tanstack/react-router";

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
import { DataGrid } from "../components/data-grid/data-grid";
import { DataGridPagination } from "../components/data-grid/data-grid-pagination";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@bookmark/ui/components/input-group";
import { Kbd, KbdGroup } from "@bookmark/ui/components/kbd";
import { toast } from "sonner";
import { Button } from "@bookmark/ui/components/button";
import { fetchBookmarks, getWhatsAppStatus } from "../utils/api";
import { useLibraryShortcuts } from "../hooks/useKeyboardShortcuts";
import {
  useDeleteBookmarkMutation,
  useMarkReadMutation,
} from "../hooks/useBookmarkMutations";
import { BookmarkRow } from "../components/BookmarkRow";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [copiedBookmarkId, setCopiedBookmarkId] = useState<number | null>(null);
  const deferredSearch = useDeferredValue(search);

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });
  const [sorting, setSorting] = useState<SortingState>([]);

  const { data, isLoading } = useQuery({
    queryKey: [
      "bookmarks",
      deferredSearch,
      pagination.pageIndex,
      pagination.pageSize,
    ],
    queryFn: () =>
      fetchBookmarks({
        search: deferredSearch || undefined,
        limit: pagination.pageSize,
        offset: pagination.pageIndex * pagination.pageSize,
      }),
  });

  const { data: whatsappStatus } = useQuery({
    queryKey: ["whatsapp", "status"],
    queryFn: getWhatsAppStatus,
    staleTime: 30_000,
  });

  const deleteMutation = useDeleteBookmarkMutation();
  const readMutation = useMarkReadMutation();

  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [deleteTarget, setDeleteTarget] = useState<Bookmark | null>(null);

  const bookmarksList = data?.bookmarks ?? [];

  useLibraryShortcuts({
    bookmarks: bookmarksList,
    focusedIndex,
    setFocusedIndex,
    onDelete: (id) => {
      const b = bookmarksList.find((bm) => bm.id === id);
      if (b) setDeleteTarget(b);
    },
    onRead: (id) => readMutation.mutate(id),
    onSelect: () => {},
    onSelectAll: () => {},
    onArchiveSelected: () => {},
    onClearSelection: () => {},
    onClearSearch: () => {
      setSearch("");
      setPagination((p) => ({ ...p, pageIndex: 0 }));
    },
    hasSelection: false,
  });

  const columns = useMemo<ColumnDef<Bookmark>[]>(
    () => [
      {
        accessorKey: "title",
        id: "title",
        enableSorting: true,
      },
      {
        accessorKey: "createdAt",
        enableSorting: true,
      },
    ],
    [],
  );

  const total = data?.total ?? 0;

  const table = useReactTable({
    columns,
    data: bookmarksList,
    pageCount: Math.ceil(total / pagination.pageSize),
    getRowId: (row) => String(row.id),
    getRowCanExpand: (row) => Boolean(row.original.description),
    manualPagination: true,
    state: { pagination, sorting },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const tableRef = useRef<HTMLDivElement>(null);

  // Collapse all expanded rows and scroll focused row into view when focus changes
  useEffect(() => {
    table.toggleAllRowsExpanded(false);
    if (!tableRef.current || focusedIndex < 0) return;
    const row = tableRef.current.querySelector(
      `#bookmark-row-${bookmarksList[focusedIndex]?.id}`,
    );
    row?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex, bookmarksList]);

  const activeDescendantId =
    focusedIndex >= 0 && bookmarksList[focusedIndex]
      ? `bookmark-row-${bookmarksList[focusedIndex].id}`
      : undefined;

  // Global keyboard handler — works without requiring focus on the list
  useEffect(() => {
    function isInputFocused() {
      const el = document.activeElement;
      return (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement ||
        (el as HTMLElement)?.isContentEditable
      );
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (isInputFocused()) return;
      // Don't intercept keys when a dialog/modal is open
      if (document.querySelector("[data-slot=alert-dialog-content]")) return;

      const key = e.key;

      // "/" → focus search
      if (key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(
          'input[aria-label="Search bookmarks"]',
        );
        input?.focus();
        input?.select();
        return;
      }

      if (bookmarksList.length === 0) return;

      // Arrow navigation
      if (key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, bookmarksList.length - 1));
      } else if (key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
      } else if (key === "Home") {
        e.preventDefault();
        setFocusedIndex(0);
      } else if (key === "End") {
        e.preventDefault();
        setFocusedIndex(bookmarksList.length - 1);
      } else if (key === "Enter" && focusedIndex >= 0) {
        e.preventDefault();
        const b = bookmarksList[focusedIndex];
        if (!b) return;
        if (e.metaKey || e.ctrlKey) {
          window.open(b.url, "_blank", "noopener,noreferrer");
          if (!b.isRead) readMutation.mutate(b.id);
        } else {
          navigator.clipboard.writeText(b.url);
          toast.success("Link copied to clipboard");
          setCopiedBookmarkId(b.id);
          setTimeout(() => setCopiedBookmarkId(null), 1000);
        }
      } else if (key === " " && focusedIndex >= 0) {
        e.preventDefault();
        const rows = table.getRowModel().rows;
        if (rows[focusedIndex]) {
          rows[focusedIndex].toggleExpanded();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [bookmarksList, focusedIndex, readMutation, setFocusedIndex, table]);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  const handleOpenLink = useCallback(
    (bookmark: Bookmark) => {
      window.open(bookmark.url, "_blank", "noopener,noreferrer");
      if (!bookmark.isRead) readMutation.mutate(bookmark.id);
    },
    [readMutation],
  );

  const handleDelete = useCallback(
    (bookmark: Bookmark) => setDeleteTarget(bookmark),
    [],
  );

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* Search */}
      <InputGroup className="w-full border-border/40 bg-muted/30 transition-[border-color,background-color] duration-150 focus-within:border-border focus-within:bg-background focus-within:ring-0 h-11 sm:h-14">
        <InputGroupAddon>
          <SearchIcon className="size-4 sm:size-5 text-muted-foreground" />
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Search bookmarks"
          placeholder="Search bookmarks…"
          type="search"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              (e.target as HTMLElement)?.blur();
            } else if (e.key === "ArrowDown" && bookmarksList.length > 0) {
              e.preventDefault();
              setFocusedIndex(0);
            }
          }}
          className="text-sm sm:text-base h-11 sm:h-14"
        />
        <InputGroupAddon align="inline-end">
          <Kbd className="hidden sm:inline-flex text-base h-8 px-3">
            {searchFocused ? "Esc" : "/"}
          </Kbd>
        </InputGroupAddon>
      </InputGroup>

      {/* Keyboard shortcuts hint — hidden on mobile (touch devices don't use keyboard) */}
      <div
        className="hidden sm:flex flex-wrap items-center justify-end gap-3 text-xs text-muted-foreground/70"
        aria-hidden="true"
      >
        <span className="inline-flex items-center gap-1.5">
          <KbdGroup>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
          </KbdGroup>{" "}
          navigate
        </span>

        <span className="inline-flex items-center gap-1.5">
          <Kbd>⏎</Kbd> copy
        </span>

        <span className="inline-flex items-center gap-1.5">
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>⏎</Kbd>
          </KbdGroup>{" "}
          open
        </span>

        <span className="inline-flex items-center gap-1.5">
          <Kbd>Space</Kbd> expand
        </span>

        <span className="inline-flex items-center gap-1.5">
          <Kbd>D</Kbd> delete
        </span>
      </div>

      {/* Table */}
      <div ref={tableRef}>
        {!isLoading && total === 0 && !deferredSearch ? (
          <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center gap-4">
            {whatsappStatus?.connected ? (
              <>
                <div className="rounded-full bg-muted p-4">
                  <BookmarkPlus className="size-8 text-muted-foreground" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-medium">No bookmarks yet</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Start sending links to your connected WhatsApp to save
                    bookmarks.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-full bg-muted p-4">
                  <MessageCircle className="size-8 text-muted-foreground" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-medium">
                    Connect WhatsApp to get started
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Link your WhatsApp account to start saving bookmarks by
                    simply sending links.
                  </p>
                </div>
                <Button render={<Link to="/settings" />}>
                  Proceed with WhatsApp setup
                </Button>
              </>
            )}
          </div>
        ) : (
          <DataGrid
            table={table}
            recordCount={total}
            isLoading={isLoading}
            loadingMode="skeleton"
            emptyMessage="No bookmarks match your search"
            tableLayout={{ headerBackground: false, rowBorder: true }}
          >
            <div className="space-y-4">
              <div
                role="listbox"
                aria-label="Bookmarks"
                aria-activedescendant={activeDescendantId}
                className="flex flex-col gap-1.5 sm:gap-2"
              >
                {table.getRowModel().rows.map((row, index) => (
                  <BookmarkRow
                    key={row.id}
                    bookmark={row.original}
                    isFocused={index === focusedIndex}
                    isCopied={copiedBookmarkId === row.original.id}
                    isExpanded={row.getIsExpanded()}
                    onToggleExpanded={row.getToggleExpandedHandler()}
                    onOpenLink={handleOpenLink}
                    onDelete={handleDelete}
                    isPendingDelete={deleteMutation.isPending}
                  />
                ))}
              </div>
              {total > 10 && (
                <DataGridPagination
                  sizes={[10, 25, 50]}
                  className="px-2 py-0 min-h-0"
                />
              )}
            </div>
          </DataGrid>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete bookmark</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{" "}
              {deleteTarget?.title
                ? `\u201c${deleteTarget.title}\u201d`
                : "this bookmark"}
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
