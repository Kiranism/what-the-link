import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClockIcon, SendIcon } from "lucide-react";
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

const HOURS = Array.from({ length: 24 }, (_, i) => {
  const label = i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`;
  return { value: i, label };
});

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
      <CardContent className="flex flex-col gap-4">
        {/* Enable/disable toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Enable daily digest</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setLocalEnabled(!enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              enabled ? "bg-primary" : "bg-muted"
            }`}
          >
            <span
              className={`inline-block size-4 rounded-full bg-background transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Time picker */}
        {enabled && (
          <div className="flex items-center gap-3">
            <ClockIcon className="size-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">Send at</span>
            <select
              value={hour}
              onChange={(e) => setLocalHour(Number(e.target.value))}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {HOURS.map((h) => (
                <option key={h.value} value={h.value}>
                  {h.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">(server time)</span>
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
