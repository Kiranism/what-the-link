import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@bookmark/ui/components/badge";
import {
  BookmarkIcon,
  LayersIcon,
  SearchIcon,
  Settings2Icon,
  SmartphoneIcon,
} from "lucide-react";
import { fetchBookmarks } from "../utils/api";

export default function Header() {
  const { data: unreadData } = useQuery({
    queryKey: ["bookmarks", "unread-count"],
    queryFn: () => fetchBookmarks({ unread: true, limit: 1 }),
    staleTime: 30_000,
  });

  const unreadCount = unreadData?.total ?? 0;

  const links = [
    { to: "/", label: "Library", icon: BookmarkIcon },
    { to: "/setup", label: "WhatsApp", icon: SmartphoneIcon },
    { to: "/settings", label: "Settings", icon: Settings2Icon },
  ] as const;

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-3 text-sm font-medium tracking-tight"
        >
          <span className="flex size-10 items-center justify-center border bg-primary text-primary-foreground shadow-sm">
            <BookmarkIcon />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-base font-semibold">
              Bookmark Manager
            </span>
            <span className="truncate text-muted-foreground text-xs">
              Curate links from WhatsApp without the mess
            </span>
          </span>
        </Link>
        <nav className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="hidden sm:inline-flex">
            Private workspace
          </Badge>
          {unreadCount > 0 && (
            <Badge variant="default" className="hidden sm:inline-flex">
              {unreadCount} unread
            </Badge>
          )}
          <span className="hidden text-xs text-muted-foreground/50 sm:inline">
            Press <kbd className="rounded border border-border/50 px-1">?</kbd>{" "}
            for shortcuts
          </span>
          {links.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="inline-flex items-center gap-2 border border-transparent px-3 py-2 text-muted-foreground text-xs transition-colors hover:border-border hover:bg-card hover:text-foreground"
              activeProps={{
                className:
                  "inline-flex items-center gap-2 border border-border bg-card px-3 py-2 text-foreground text-xs shadow-sm",
              }}
            >
              <Icon />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
