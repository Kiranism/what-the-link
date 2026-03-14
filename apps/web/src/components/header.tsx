import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@bookmark/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bookmark/ui/components/dropdown-menu";
import {
  BookmarkIcon,
  LogOutIcon,
  MoonIcon,
  Settings2Icon,
  SunIcon,
  UserIcon,
} from "lucide-react";
import { useTheme } from "better-themes";
import { fetchBookmarks } from "../utils/api";
import { useAuth } from "../hooks/useAuth";

const links = [
  { to: "/", label: "Library", icon: BookmarkIcon },
  { to: "/settings", label: "Settings", icon: Settings2Icon },
] as const;

export default function Header() {
  const { isAuthenticated, setPassword } = useAuth();

  const { data: unreadData } = useQuery({
    queryKey: ["bookmarks", "unread-count"],
    queryFn: () => fetchBookmarks({ unread: true, limit: 1 }),
    staleTime: 30_000,
    enabled: isAuthenticated,
  });

  const unreadCount = unreadData?.total ?? 0;

  return (
    <header className="sticky top-0 z-20 border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center gap-2 sm:gap-4 px-2 py-2 sm:px-6 sm:py-3 lg:px-8">
        {/* Logo & app name */}
        <Link
          to="/"
          className="flex items-center gap-2.5 text-lg font-medium no-underline hover:no-underline"
        >
          <span className="hidden font-semibold sm:inline">
            𝙒𝞖𝞓𝞣 𝞣𝞖𝞢 𝙇𝞘𝞟𝞙¯\_(ツ)_/¯
          </span>
        </Link>

        {isAuthenticated && (
          <>
            <span className="hidden text-border sm:inline">/</span>

            {/* Nav links */}
            <nav className="flex items-center gap-1">
              {links.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  aria-label={label}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground no-underline transition-[background-color,color] duration-150 hover:bg-foreground/10 hover:text-foreground hover:no-underline"
                  activeProps={{
                    className:
                      "inline-flex items-center gap-1.5 rounded-md bg-foreground/10 px-3 py-1.5 text-sm font-medium text-foreground no-underline hover:no-underline",
                  }}
                >
                  <Icon aria-hidden="true" className="size-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              ))}
            </nav>
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Theme toggle */}
        <ThemeToggle />

        {/* User menu */}
        {isAuthenticated && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
              render={<button />}
            >
              <UserIcon aria-hidden="true" className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8}>
              <DropdownMenuItem onClick={() => setPassword(null)}>
                <LogOutIcon aria-hidden="true" className="size-3.5" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="size-8 text-muted-foreground"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      <SunIcon className="size-4 rotate-0 scale-100 transition-transform dark:rotate-90 dark:scale-0" />
      <MoonIcon className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
