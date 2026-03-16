import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SendIcon, ClockIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@bookmark/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@bookmark/ui/components/card";
import { fetchSettings, updateSettings } from "../../utils/api";

function formatHour(h: number): string {
  if (h === 0) return "12:00 AM";
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return "12:00 PM";
  return `${h - 12}:00 PM`;
}

export function DigestSettings() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings,
    staleTime: 30_000,
  });

  const [localEnabled, setLocalEnabled] = useState<boolean | null>(null);
  const [localHour, setLocalHour] = useState<number | null>(null);

  const enabled = localEnabled ?? settings?.digestEnabled ?? true;
  const hour = localHour ?? settings?.digestHour ?? 20;

  const hasChanges =
    (localEnabled !== null && localEnabled !== settings?.digestEnabled) ||
    (localHour !== null && localHour !== settings?.digestHour);

  const mutation = useMutation({
    mutationFn: () =>
      updateSettings({
        digestEnabled: enabled,
        digestHour: hour,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setLocalEnabled(null);
      setLocalHour(null);
      toast.success("Digest settings saved");
    },
    onError: () => {
      toast.error("Failed to save digest settings");
    },
  });

  return (
    <Card className="border-border/80 bg-card/85 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SendIcon className="size-5" />
          Daily Digest
        </CardTitle>
        <CardDescription>
          Get a daily summary of saved bookmarks sent to your WhatsApp group.
          Includes today's saves, top tags, and a resurfaced old bookmark.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Toggle + time in one row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setLocalEnabled(!enabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                enabled ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block size-4 rounded-full bg-background transition-transform ${
                  enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className="text-sm font-medium">
              {enabled ? "Enabled" : "Disabled"}
            </span>
          </div>

          {enabled && (
            <div className="flex items-center gap-2">
              <ClockIcon className="size-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Send at</span>
              <span className="text-sm font-medium tabular-nums">{formatHour(hour)}</span>
              <span className="text-xs text-muted-foreground hidden sm:inline">(server time)</span>
            </div>
          )}
        </div>

        {/* Time presets */}
        {enabled && (
          <div className="flex flex-wrap items-center gap-2">
            {[8, 9, 12, 18, 20, 21, 22].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setLocalHour(h)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  hour === h
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {formatHour(h)}
              </button>
            ))}
          </div>
        )}

        {/* Save button */}
        {hasChanges && (
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
