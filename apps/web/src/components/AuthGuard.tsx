import { useState } from "react";
import { AlertCircleIcon, LockIcon } from "lucide-react";
import { Button } from "@bookmark/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@bookmark/ui/components/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@bookmark/ui/components/input-group";
import { Alert, AlertDescription, AlertTitle } from "@bookmark/ui/components/alert";
import { Badge } from "@bookmark/ui/components/badge";
import { useAuth } from "../hooks/useAuth";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, setPassword } = useAuth();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = input.trim();
    if (!value) {
      setError("Enter a password");
      return;
    }
    setPassword(value);
    setError("");
  };

  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <Card className="w-full max-w-md border-border/80 bg-card/90 shadow-xl shadow-primary/5 backdrop-blur">
        <CardHeader className="gap-3">
          <Badge variant="secondary" className="w-fit">
            Secure access
          </Badge>
          <CardTitle className="text-xl">
            Unlock your bookmark workspace
          </CardTitle>
          <CardDescription>
            Enter the app password stored for this workspace to view and manage
            links captured from WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <InputGroup>
              <InputGroupAddon>
                <LockIcon />
              </InputGroupAddon>
              <InputGroupInput
                type="password"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setError("");
                }}
                placeholder="Password"
                autoFocus
                aria-label="App password"
                aria-invalid={Boolean(error)}
              />
            </InputGroup>
            {error ? (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>Missing password</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" size="lg" className="w-full">
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
