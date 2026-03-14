import { useCallback, useSyncExternalStore } from "react";
import { setAuthToken } from "../utils/api";

const STORAGE_KEY = "app_password";
const VERIFIED_KEY = "app_password_verified";
const API_BASE = (import.meta.env.VITE_SERVER_URL ?? "") + "/api";

// Shared reactive store so all useAuth() instances stay in sync
let listeners: Array<() => void> = [];
let snapshot = { password: null as string | null, verified: false };

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
  return { password: null, verified: false };
}

// Initialize from localStorage once
if (typeof window !== "undefined") {
  const stored = localStorage.getItem(STORAGE_KEY);
  const wasVerified = localStorage.getItem(VERIFIED_KEY) === "true";
  if (stored) {
    snapshot = { password: stored, verified: wasVerified };
    setAuthToken(stored);
  }
}

export function useAuth() {
  const { password, verified } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const setPassword = useCallback((value: string | null) => {
    if (typeof window === "undefined") return;
    if (value == null) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(VERIFIED_KEY);
      snapshot.password = null;
      snapshot.verified = false;
      setAuthToken(null);
    } else {
      localStorage.setItem(STORAGE_KEY, value);
      snapshot.password = value;
      setAuthToken(value);
    }
    emitChange();
  }, []);

  const validatePassword = useCallback(async (pwd: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/bookmarks?limit=1`, {
        headers: {
          Authorization: `Bearer ${pwd}`,
          "Content-Type": "application/json",
        },
      });
      if (res.ok) {
        localStorage.setItem(VERIFIED_KEY, "true");
        snapshot.password = pwd;
        snapshot.verified = true;
        setAuthToken(pwd);
        emitChange();
        return true;
      }
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(VERIFIED_KEY);
      snapshot.password = null;
      snapshot.verified = false;
      setAuthToken(null);
      emitChange();
      return false;
    } catch {
      return false;
    }
  }, []);

  const isAuthenticated = !!password && verified;

  return { password, setPassword, isAuthenticated, validatePassword };
}
