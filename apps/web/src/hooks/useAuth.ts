import { useCallback, useSyncExternalStore } from "react";

const VERIFIED_KEY = "app_authenticated";
const API_BASE = (import.meta.env.VITE_SERVER_URL ?? "") + "/api";

// Shared reactive store so all useAuth() instances stay in sync
let listeners: Array<() => void> = [];
let snapshot = { authenticated: false };

function emitChange() {
  snapshot = { ...snapshot };
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return { authenticated: false };
}

// Initialize from sessionStorage flag (cookie does the real auth)
if (typeof window !== "undefined") {
  const wasVerified = sessionStorage.getItem(VERIFIED_KEY) === "true";
  if (wasVerified) {
    snapshot = { authenticated: true };
  }
}

export function useAuth() {
  const { authenticated } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const login = useCallback(async (password: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        sessionStorage.setItem(VERIFIED_KEY, "true");
        snapshot.authenticated = true;
        emitChange();
        return true;
      }
      sessionStorage.removeItem(VERIFIED_KEY);
      snapshot.authenticated = false;
      emitChange();
      return false;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Ignore — clear local state regardless
    }
    sessionStorage.removeItem(VERIFIED_KEY);
    snapshot.authenticated = false;
    emitChange();
  }, []);

  const validateSession = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/bookmarks?limit=1`, {
        credentials: "include",
      });
      if (res.ok) {
        sessionStorage.setItem(VERIFIED_KEY, "true");
        snapshot.authenticated = true;
        emitChange();
        return true;
      }
      sessionStorage.removeItem(VERIFIED_KEY);
      snapshot.authenticated = false;
      emitChange();
      return false;
    } catch {
      return false;
    }
  }, []);

  return { isAuthenticated: authenticated, login, logout, validateSession };
}
