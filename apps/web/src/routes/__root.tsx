import { Toaster } from "@bookmark/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ThemeProvider } from "better-themes";

import { AuthGuard } from "../components/AuthGuard";
import Header from "../components/header";
import { KeyboardShortcutsHelp } from "../components/KeyboardShortcutsHelp";
import { useGlobalShortcuts, useNavigationShortcuts } from "../hooks/useKeyboardShortcuts";

import appCss from "../index.css?url";

export interface RouterAppContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "WhatsApp Bookmarks" },
      { name: "theme-color", content: "#f5f0e8", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#1c1c1c", media: "(prefers-color-scheme: dark)" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootDocument,
});

function GlobalShortcuts() {
  const { showHelp, setShowHelp } = useGlobalShortcuts();
  useNavigationShortcuts();

  return (
    <KeyboardShortcutsHelp open={showHelp} onOpenChange={setShowHelp} />
  );
}

function RootDocument() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-svh bg-background text-foreground">
        <ThemeProvider attribute="class" disableTransitionOnChange>
          <div className="relative min-h-svh overflow-x-hidden">
            <div className="relative grid min-h-svh grid-rows-[auto_1fr]">
              <Header />
              <main className="mx-auto flex w-full max-w-5xl flex-col px-2 py-4 sm:px-6 sm:py-6 lg:px-8">
                <AuthGuard>
                  <GlobalShortcuts />
                  <Outlet />
                </AuthGuard>
              </main>
            </div>
          </div>
          <Toaster />
        </ThemeProvider>
        <TanStackRouterDevtools position="bottom-left" />
        <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}
