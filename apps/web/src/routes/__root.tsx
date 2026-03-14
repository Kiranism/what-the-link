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
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-svh bg-background text-foreground">
        <div className="relative min-h-svh overflow-x-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_top_left,rgba(94,234,212,0.18),transparent_35%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_30%),linear-gradient(to_bottom,rgba(255,255,255,0.72),transparent)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-80 bg-[radial-gradient(circle_at_bottom,rgba(251,191,36,0.12),transparent_40%)]"
          />
          <div className="relative grid min-h-svh grid-rows-[auto_1fr]">
            <Header />
            <main className="mx-auto flex w-full max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
              <AuthGuard>
                <GlobalShortcuts />
                <Outlet />
              </AuthGuard>
            </main>
          </div>
        </div>
        <Toaster richColors />
        <TanStackRouterDevtools position="bottom-left" />
        <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}
