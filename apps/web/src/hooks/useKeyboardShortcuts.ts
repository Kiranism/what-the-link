import { useHotkey } from "@tanstack/react-hotkeys";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);

  // Cmd+K / Ctrl+K → focus search input
  useHotkey("Mod+K", (e) => {
    e.preventDefault();
    const searchInput = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search bookmarks"]',
    );
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    } else {
      navigate({ to: "/" });
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>(
          'input[aria-label="Search bookmarks"]',
        );
        input?.focus();
        input?.select();
      }, 100);
    }
  });

  // ? → toggle help (native listener since Shift+/ is excluded from TanStack Hotkeys)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.key === "?" &&
        !e.ctrlKey && !e.metaKey && !e.altKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        setShowHelp((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Escape → close help
  useHotkey("Escape", () => {
    if (showHelp) setShowHelp(false);
  });

  return { showHelp, setShowHelp };
}

export function useNavigationShortcuts() {
  const navigate = useNavigate();

  useHotkey("Alt+1", (e) => {
    e.preventDefault();
    navigate({ to: "/" });
  });

  useHotkey("Alt+2", (e) => {
    e.preventDefault();
    navigate({ to: "/swipe" });
  });

  useHotkey("Alt+3", (e) => {
    e.preventDefault();
    navigate({ to: "/search" });
  });

  useHotkey("Alt+4", (e) => {
    e.preventDefault();
    navigate({ to: "/setup" });
  });

  useHotkey("Alt+5", (e) => {
    e.preventDefault();
    navigate({ to: "/settings" });
  });
}

interface UseLibraryShortcutsOptions {
  bookmarks: Array<{ id: number; url: string; isFavorite: boolean; isRead: boolean }>;
  focusedIndex: number;
  setFocusedIndex: (index: number | ((prev: number) => number)) => void;
  onFavorite: (id: number, isFavorite: boolean) => void;
  onDelete: (id: number) => void;
  onRead: (id: number) => void;
  onSelect: (id: number) => void;
  onSelectAll: () => void;
  onArchiveSelected: () => void;
  onClearSelection: () => void;
  onClearSearch: () => void;
  hasSelection: boolean;
}

export function useLibraryShortcuts(opts: UseLibraryShortcutsOptions) {
  const {
    bookmarks,
    focusedIndex,
    setFocusedIndex,
    onFavorite,
    onDelete,
    onRead,
    onSelect,
    onSelectAll,
    onArchiveSelected,
    onClearSelection,
    onClearSearch,
    hasSelection,
  } = opts;

  const isInputFocused = useCallback(() => {
    const el = document.activeElement;
    return (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      (el as HTMLElement)?.isContentEditable
    );
  }, []);

  const getFocusedBookmark = useCallback(() => {
    if (focusedIndex >= 0 && focusedIndex < bookmarks.length) {
      return bookmarks[focusedIndex];
    }
    return null;
  }, [focusedIndex, bookmarks]);

  // J → move down
  useHotkey("J", () => {
    if (isInputFocused()) return;
    setFocusedIndex((prev: number) => Math.min(prev + 1, bookmarks.length - 1));
  });

  // K → move up
  useHotkey("K", () => {
    if (isInputFocused()) return;
    setFocusedIndex((prev: number) => Math.max(prev - 1, 0));
  });

  // F → toggle favorite
  useHotkey("F", () => {
    if (isInputFocused()) return;
    const b = getFocusedBookmark();
    if (b) onFavorite(b.id, !b.isFavorite);
  });

  // O or Enter → open link
  useHotkey("O", () => {
    if (isInputFocused()) return;
    const b = getFocusedBookmark();
    if (b) {
      window.open(b.url, "_blank", "noopener,noreferrer");
      if (!b.isRead) onRead(b.id);
    }
  });

  useHotkey("Enter", () => {
    if (isInputFocused()) return;
    const b = getFocusedBookmark();
    if (b) {
      window.open(b.url, "_blank", "noopener,noreferrer");
      if (!b.isRead) onRead(b.id);
    }
  });

  // X → toggle select focused row
  useHotkey("X", () => {
    if (isInputFocused()) return;
    const b = getFocusedBookmark();
    if (b) onSelect(b.id);
  });

  // Mod+A → select all
  useHotkey("Mod+A", (e) => {
    if (isInputFocused()) return;
    e.preventDefault();
    onSelectAll();
  });

  // A → archive selected (when there's a selection)
  useHotkey("A", () => {
    if (isInputFocused()) return;
    if (hasSelection) onArchiveSelected();
  });

  // Escape → clear selection or search
  useHotkey("Escape", () => {
    if (hasSelection) {
      onClearSelection();
    } else {
      onClearSearch();
      (document.activeElement as HTMLElement)?.blur();
    }
  });

  // Delete focused (D key)
  useHotkey("D", () => {
    if (isInputFocused()) return;
    const b = getFocusedBookmark();
    if (b && confirm("Delete this bookmark?")) {
      onDelete(b.id);
    }
  });
}

export const SHORTCUT_GROUPS = [
  {
    title: "Global",
    shortcuts: [
      { keys: "Cmd+K", description: "Focus search" },
      { keys: "Alt+1-5", description: "Navigate to page" },
      { keys: "?", description: "Toggle shortcuts help" },
    ],
  },
  {
    title: "Library",
    shortcuts: [
      { keys: "J / K", description: "Navigate up / down" },
      { keys: "Enter / O", description: "Open focused link" },
      { keys: "F", description: "Toggle favorite" },
      { keys: "X", description: "Select / deselect row" },
      { keys: "Cmd+A", description: "Select all" },
      { keys: "A", description: "Archive selected" },
      { keys: "D", description: "Delete focused" },
      { keys: "Escape", description: "Clear selection / search" },
    ],
  },
];
