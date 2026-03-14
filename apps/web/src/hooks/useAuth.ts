import { useCallback, useState } from "react";

const STORAGE_KEY = "app_password";

export function useAuth() {
  const [password, setPasswordState] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null,
  );

  const setPassword = useCallback((value: string | null) => {
    if (typeof window === "undefined") return;
    if (value == null) {
      localStorage.removeItem(STORAGE_KEY);
      setPasswordState(null);
    } else {
      localStorage.setItem(STORAGE_KEY, value);
      setPasswordState(value);
    }
  }, []);

  const isAuthenticated = !!password;

  return { password, setPassword, isAuthenticated };
}
