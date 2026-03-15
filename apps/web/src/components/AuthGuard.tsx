import { useState, useEffect } from "react";
import { AlertCircleIcon, LockIcon, Loader2Icon } from "lucide-react";
import { Button } from "@bookmark/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@bookmark/ui/components/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@bookmark/ui/components/input-group";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@bookmark/ui/components/alert";
import { Badge } from "@bookmark/ui/components/badge";
import { useAuth } from "../hooks/useAuth";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, login, validateSession } = useAuth();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialCheck, setInitialCheck] = useState(true);

  // On mount, validate existing session cookie against the backend
  useEffect(() => {
    if (!isAuthenticated) {
      // Try validating — cookie might still be valid from a previous session
      validateSession().finally(() => setInitialCheck(false));
    } else {
      validateSession().then((valid) => {
        if (!valid) {
          setError("Session expired. Please log in again.");
        }
        setInitialCheck(false);
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (initialCheck) {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = input.trim();
    if (!value) {
      setError("Enter a password");
      return;
    }
    setLoading(true);
    setError("");
    const valid = await login(value);
    setLoading(false);
    if (valid) {
      setInput("");
    } else {
      setError("Invalid password");
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <Card className="w-full max-w-md border-border/80 bg-card/90 shadow-xl shadow-primary/5 backdrop-blur">
        <CardHeader className="gap-3">
          <Badge variant="secondary" className="w-fit">
            𝙒𝞖𝞓𝞣 𝞣𝞖𝞢 𝙇𝞘𝞟𝞙¯\_(ツ)_/¯
          </Badge>
          <CardTitle className="text-xl">
            Stop losing links in WhatsApp
          </CardTitle>
          <CardDescription className="space-y-2">
            <p>
              Drop a link in your WhatsApp group, and it lands here — tagged,
              searchable, and actually findable when you need it. No more
              scrolling through chat history like an archaeologist.
            </p>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <InputGroup>
              <InputGroupAddon>
                <LockIcon aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                type="password"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setError("");
                }}
                placeholder="Secret phrase"
                autoFocus
                aria-label="App password"
                aria-invalid={Boolean(error)}
                disabled={loading}
              />
            </InputGroup>
            {error ? (
              <Alert variant="destructive">
                <AlertCircleIcon aria-hidden="true" />
                <AlertTitle>Authentication failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2Icon className="size-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                "Unlock"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
