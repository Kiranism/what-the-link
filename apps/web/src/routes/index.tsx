import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, PaginationState, RowSelectionState, SortingState } from "@tanstack/react-table";
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { Bookmark } from "@bookmark/types";
import {
  ArchiveIcon,
  CheckSquareIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleIcon,
  ExternalLinkIcon,
  MailIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";

import { Badge } from "@bookmark/ui/components/badge";
import { Button } from "@bookmark/ui/components/button";
import { DataGrid, DataGridContainer } from "../components/data-grid/data-grid";
import { DataGridPagination } from "../components/data-grid/data-grid-pagination";
import { DataGridTable } from "../components/data-grid/data-grid-table";
import { ScrollArea, ScrollBar } from "@bookmark/ui/components/scroll-area";
import { SearchBar } from "../components/SearchBar";
import { TagFilter } from "../components/TagFilter";
import { Checkbox } from "@bookmark/ui/components/checkbox";
import { fetchBookmarks, updateBookmark, deleteBookmark, bulkUpdateBookmarks } from "../utils/api";
import { useLibraryShortcuts } from "../hooks/useKeyboardShortcuts";

export const Route = createFileRoute("/")({
  component: HomePage,
});

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function HomePage() {
  const [search, setSearch] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const deferredSearch = useDeferredValue(search);

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: [
      "bookmarks",
      deferredSearch,
      selectedTags,
      showFavoritesOnly,
      showUnreadOnly,
      pagination.pageIndex,
      pagination.pageSize,
    ],
    queryFn: () =>
      fetchBookmarks({
        search: deferredSearch || undefined,
        tags: selectedTags.length ? selectedTags : undefined,
        favorite: showFavoritesOnly || undefined,
        unread: showUnreadOnly || undefined,
        limit: pagination.pageSize,
        offset: pagination.pageIndex * pagination.pageSize,
      }),
  });

  const favoriteMutation = useMutation({
    mutationFn: ({ id, isFavorite }: { id: number; isFavorite: boolean }) =>
      updateBookmark(id, { isFavorite }),
    onMutate: async ({ id, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey: ["bookmarks"] });
      const prev = queryClient.getQueriesData({ queryKey: ["bookmarks"] });
      queryClient.setQueriesData({ queryKey: ["bookmarks"] }, (old: any) => {
        if (!old?.bookmarks) return old;
        return { ...old, bookmarks: old.bookmarks.map((b: Bookmark) => b.id === id ? { ...b, isFavorite } : b) };
      });
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        for (const [key, data] of context.prev) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteBookmark(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["bookmarks"] });
      const prev = queryClient.getQueriesData({ queryKey: ["bookmarks"] });
      queryClient.setQueriesData({ queryKey: ["bookmarks"] }, (old: any) => {
        if (!old?.bookmarks) return old;
        return { ...old, bookmarks: old.bookmarks.filter((b: Bookmark) => b.id !== id), total: old.total - 1 };
      });
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        for (const [key, data] of context.prev) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
  });

  const readMutation = useMutation({
    mutationFn: (id: number) => updateBookmark(id, { isRead: true }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["bookmarks"] });
      const prev = queryClient.getQueriesData({ queryKey: ["bookmarks"] });
      queryClient.setQueriesData({ queryKey: ["bookmarks"] }, (old: any) => {
        if (!old?.bookmarks) return old;
        return { ...old, bookmarks: old.bookmarks.map((b: Bookmark) => b.id === id ? { ...b, isRead: true } : b) };
      });
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        for (const [key, data] of context.prev) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["bookmarks"] }),
  });

  const bulkMutation = useMutation({
    mutationFn: ({ ids, action }: { ids: number[]; action: string }) =>
      bulkUpdateBookmarks(ids, action as any),
    onSuccess: () => {
      setRowSelection({});
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });

  const selectedIds = Object.keys(rowSelection)
    .filter((k) => rowSelection[k])
    .map(Number);

  const [focusedIndex, setFocusedIndex] = useState(-1);

  const bookmarksList = data?.bookmarks ?? [];

  const handleSelectRow = useCallback((id: number) => {
    setRowSelection((prev) => {
      const key = String(id);
      return { ...prev, [key]: !prev[key] };
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const all: RowSelectionState = {};
    for (const b of bookmarksList) {
      all[String(b.id)] = true;
    }
    setRowSelection(all);
  }, [bookmarksList]);

  useLibraryShortcuts({
    bookmarks: bookmarksList,
    focusedIndex,
    setFocusedIndex,
    onFavorite: (id, isFavorite) => favoriteMutation.mutate({ id, isFavorite }),
    onDelete: (id) => deleteMutation.mutate(id),
    onRead: (id) => readMutation.mutate(id),
    onSelect: handleSelectRow,
    onSelectAll: handleSelectAll,
    onArchiveSelected: () => {
      if (selectedIds.length > 0) {
        bulkMutation.mutate({ ids: selectedIds, action: "archive" });
      }
    },
    onClearSelection: () => setRowSelection({}),
    onClearSearch: () => {
      setSearch("");
      setSelectedTags([]);
      setShowFavoritesOnly(false);
      setShowUnreadOnly(false);
      setPagination((p) => ({ ...p, pageIndex: 0 }));
    },
    hasSelection: selectedIds.length > 0,
  });

  const columns = useMemo<ColumnDef<Bookmark>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
            className="size-4"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            className="size-4"
          />
        ),
        size: 36,
        enableSorting: false,
      },
      {
        id: "expand",
        header: () => null,
        cell: ({ row }) =>
          row.getCanExpand() ? (
            <Button
              className="size-6 text-muted-foreground hover:bg-transparent"
              onClick={row.getToggleExpandedHandler()}
              variant="ghost"
              size="icon-sm"
            >
              {row.getIsExpanded() ? (
                <ChevronUpIcon aria-hidden="true" />
              ) : (
                <ChevronDownIcon aria-hidden="true" />
              )}
            </Button>
          ) : null,
        size: 36,
        meta: {
          expandedContent: (bookmark: Bookmark) =>
            bookmark.description ? (
              <p className="text-muted-foreground py-3 px-4 text-xs leading-6 whitespace-pre-wrap break-words">
                {bookmark.description}
              </p>
            ) : null,
        },
      },
      {
        accessorKey: "title",
        id: "title",
        header: "Title",
        cell: ({ row }) => {
          const { title, url, favicon, isRead } = row.original;
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              {!isRead && (
                <CircleIcon className="size-2 shrink-0 fill-primary text-primary" />
              )}
              {favicon ? (
                <img
                  src={favicon}
                  alt=""
                  className="size-4 shrink-0"
                  loading="lazy"
                />
              ) : (
                <div className="size-4 shrink-0 rounded-sm border bg-muted" />
              )}
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate font-medium text-foreground hover:text-primary hover:underline underline-offset-4"
              >
                {title || url}
              </a>
            </div>
          );
        },
        size: 280,
        enableSorting: true,
      },
      {
        accessorKey: "domain",
        header: "Domain",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">
            {row.original.domain}
          </span>
        ),
        size: 140,
      },
      {
        accessorKey: "tags",
        header: "Tags",
        cell: ({ row }) => {
          const tags = Array.isArray(row.original.tags) ? row.original.tags : [];
          if (!tags.length)
            return (
              <span className="text-muted-foreground/50 text-xs">—</span>
            );
          return (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {tags.length > 3 && (
                <Badge variant="secondary" className="text-xs">
                  +{tags.length - 3}
                </Badge>
              )}
            </div>
          );
        },
        size: 180,
        enableSorting: false,
      },
      {
        accessorKey: "source",
        header: "Source",
        cell: ({ row }) => (
          <Badge variant="secondary" className="text-xs capitalize">
            {row.original.source}
          </Badge>
        ),
        size: 90,
      },
      {
        accessorKey: "createdAt",
        header: "Saved",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">
            {dateFormatter.format(new Date(String(row.original.createdAt)))}
          </span>
        ),
        size: 110,
        enableSorting: true,
      },
      {
        id: "actions",
        header: () => null,
        cell: ({ row }) => {
          const bookmark = row.original;
          return (
            <div className="flex items-center gap-1">
              <Button
                variant={bookmark.isFavorite ? "default" : "outline"}
                size="icon-sm"
                className="size-7"
                title={bookmark.isFavorite ? "Unfavorite" : "Favorite"}
                disabled={favoriteMutation.isPending}
                onClick={() =>
                  favoriteMutation.mutate({
                    id: bookmark.id,
                    isFavorite: !bookmark.isFavorite,
                  })
                }
              >
                <StarIcon className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                className="size-7"
                title="Open link"
                onClick={() => {
                  window.open(bookmark.url, "_blank", "noopener,noreferrer");
                  if (!bookmark.isRead) {
                    readMutation.mutate(bookmark.id);
                  }
                }}
              >
                <ExternalLinkIcon className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                className="size-7 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                title="Delete bookmark"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (confirm("Delete this bookmark?")) {
                    deleteMutation.mutate(bookmark.id);
                  }
                }}
              >
                <Trash2Icon className="size-3.5" />
              </Button>
            </div>
          );
        },
        size: 110,
      },
    ],
    [favoriteMutation, deleteMutation, readMutation],
  );

  const total = data?.total ?? 0;

  const table = useReactTable({
    columns,
    data: bookmarksList,
    pageCount: Math.ceil(total / pagination.pageSize),
    getRowId: (row) => String(row.id),
    getRowCanExpand: (row) => Boolean(row.original.description),
    manualPagination: true,
    enableRowSelection: true,
    state: { pagination, sorting, rowSelection },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tableRef.current || focusedIndex < 0) return;
    const rows = tableRef.current.querySelectorAll("tbody tr");
    rows.forEach((row, i) => {
      if (i === focusedIndex) {
        row.classList.add("ring-2", "ring-primary/50", "ring-inset");
        row.scrollIntoView({ block: "nearest" });
      } else {
        row.classList.remove("ring-2", "ring-primary/50", "ring-inset");
      }
    });
    return () => {
      rows.forEach((row) => {
        row.classList.remove("ring-2", "ring-primary/50", "ring-inset");
      });
    };
  }, [focusedIndex]);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  function handleTagsChange(tags: string[]) {
    setSelectedTags(tags);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  function handleFavoritesToggle() {
    setShowFavoritesOnly((c) => !c);
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-60">
          <SearchBar value={search} onChange={handleSearchChange} />
        </div>
        <Button
          variant={showUnreadOnly ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setShowUnreadOnly((c) => !c);
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
        >
          <MailIcon data-icon="inline-start" />
          {showUnreadOnly ? "Showing unread" : "Unread only"}
        </Button>
        <Button
          variant={showFavoritesOnly ? "default" : "outline"}
          size="sm"
          onClick={handleFavoritesToggle}
        >
          <StarIcon data-icon="inline-start" />
          {showFavoritesOnly ? "Showing favorites" : "Favorites only"}
        </Button>
        <div className="text-muted-foreground text-sm">
          {isLoading ? "Loading…" : `${total} bookmark${total !== 1 ? "s" : ""}`}
        </div>
      </div>

      {/* Tag filter */}
      <TagFilter selected={selectedTags} onChange={handleTagsChange} />

      {/* Bulk actions */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2">
          <span className="text-sm font-medium">{selectedIds.length} selected</span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkMutation.mutate({ ids: selectedIds, action: "archive" })}
              disabled={bulkMutation.isPending}
            >
              <ArchiveIcon data-icon="inline-start" />
              Archive
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkMutation.mutate({ ids: selectedIds, action: "favorite" })}
              disabled={bulkMutation.isPending}
            >
              <StarIcon data-icon="inline-start" />
              Favorite
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkMutation.mutate({ ids: selectedIds, action: "markRead" })}
              disabled={bulkMutation.isPending}
            >
              <CheckSquareIcon data-icon="inline-start" />
              Mark read
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm(`Delete ${selectedIds.length} bookmark(s)?`)) {
                  bulkMutation.mutate({ ids: selectedIds, action: "delete" });
                }
              }}
              disabled={bulkMutation.isPending}
            >
              <Trash2Icon data-icon="inline-start" />
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div ref={tableRef}>
      <DataGrid
        table={table}
        recordCount={total}
        isLoading={isLoading}
        loadingMode="skeleton"
        emptyMessage="No bookmarks found. Try adjusting your filters."
        tableLayout={{ headerBackground: false, rowBorder: true }}
      >
        <div className="space-y-2">
          <DataGridContainer border={false}>
            <ScrollArea>
              <DataGridTable />
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </DataGridContainer>
          <DataGridPagination sizes={[10, 25, 50]} />
        </div>
      </DataGrid>
      </div>
    </div>
  );
}
