import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useState } from "react";
import { DownloadIcon, InfoIcon, RefreshCwIcon, ShieldCheckIcon, UploadIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@bookmark/ui/components/alert";
import { Badge } from "@bookmark/ui/components/badge";
import { Button } from "@bookmark/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@bookmark/ui/components/card";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@bookmark/ui/components/combobox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@bookmark/ui/components/field";
import { Spinner } from "@bookmark/ui/components/spinner";
import {
  exportBookmarks,
  fetchSettings,
  fetchWhatsAppGroups,
  importBookmarks,
  refreshWhatsAppGroups,
  updateSettings,
} from "../utils/api";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

type GroupOption = {
  label: string;
  value: string;
  searchText: string;
};

function getGroupOptionLabel(option: GroupOption | null | undefined) {
  return option?.label ?? "";
}

function getGroupOptionValue(option: GroupOption | null | undefined) {
  return option?.value ?? "";
}

function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings,
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["settings", "whatsapp-groups"],
    queryFn: fetchWhatsAppGroups,
  });
  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(["settings"], data);
      toast.success("Settings updated");
    },
    onError: () => {
      toast.error("Could not save settings");
    },
  });

  const refreshGroupsMutation = useMutation({
    mutationFn: refreshWhatsAppGroups,
    onSuccess: (data) => {
      queryClient.setQueryData(["settings", "whatsapp-groups"], data);
      toast.success(`Refreshed — ${data.length} group(s) found`);
    },
    onError: () => {
      toast.error("Could not refresh groups");
    },
  });

  const [waGroupJid, setWaGroupJid] = useState("");
  const [groupQuery, setGroupQuery] = useState("");

  useEffect(() => {
    if (settings) {
      setWaGroupJid(settings.waAllowedGroupJid ?? "");
    }
  }, [settings?.waAllowedGroupJid]);

  const deferredGroupQuery = useDeferredValue(groupQuery);
  const groupOptions: GroupOption[] = groups.map((group) => ({
    label: group.name || group.jid,
    value: group.jid,
    searchText: `${group.name || ""} ${group.jid}`.toLowerCase(),
  }));
  const selectedGroup =
    groupOptions.find((group) => group.value === waGroupJid) ?? null;

  useEffect(() => {
    if (!settings) {
      return;
    }

    if (selectedGroup) {
      setGroupQuery(selectedGroup.label);
      return;
    }

    if (!settings.waAllowedGroupJid) {
      setGroupQuery("");
    }
  }, [selectedGroup, settings?.waAllowedGroupJid]);

  const normalizedQuery = deferredGroupQuery.trim().toLowerCase();
  const matchedGroupOptions = normalizedQuery
    ? groupOptions.filter((group) => group.searchText.includes(normalizedQuery))
    : groupOptions;
  const visibleGroupOptions = matchedGroupOptions.slice(0, 10);
  const hiddenMatchCount = Math.max(
    matchedGroupOptions.length - visibleGroupOptions.length,
    0,
  );

  const groupJidDirty =
    (settings?.waAllowedGroupJid ?? "") !== (waGroupJid.trim() || "");

  const handleSaveGroupJid = () => {
    const value = waGroupJid.trim() || null;
    mutation.mutate({ waAllowedGroupJid: value });
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-border/80 bg-card/85 shadow-sm">
        <CardHeader className="gap-3">
          <Badge variant="secondary" className="w-fit">
            <ShieldCheckIcon data-icon="inline-start" />
            Workspace controls
          </Badge>
          <CardTitle className="text-3xl tracking-tight">Settings</CardTitle>
          <CardDescription className="max-w-2xl">
            Control which WhatsApp chats are allowed to create bookmarks and
            keep the saved pipeline predictable.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="border-border/80 bg-card/80">
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UsersIcon className="text-muted-foreground" />
              <CardTitle>Allowed WhatsApp group</CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshGroupsMutation.mutate()}
              disabled={refreshGroupsMutation.isPending}
            >
              <RefreshCwIcon className={refreshGroupsMutation.isPending ? "animate-spin" : ""} data-icon="inline-start" />
              Refresh groups
            </Button>
          </div>
          <CardDescription>
            Search known groups locally and save a single group filter.
            Press "Refresh groups" to re-fetch the latest list from WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel>Known groups</FieldLabel>
              <FieldContent className="gap-4">
                {!isLoading && groupOptions.length > 0 ? (
                  <>
                    <Combobox<GroupOption>
                      items={groupOptions}
                      filteredItems={visibleGroupOptions}
                      value={selectedGroup}
                      inputValue={groupQuery}
                      onInputValueChange={setGroupQuery}
                      onValueChange={(value) => {
                        setWaGroupJid(value?.value ?? "");
                        setGroupQuery(value?.label ?? "");
                      }}
                      itemToStringLabel={getGroupOptionLabel}
                      itemToStringValue={getGroupOptionValue}
                      isItemEqualToValue={(item, value) =>
                        item.value === value.value
                      }
                      autoHighlight
                    >
                      <ComboboxInput
                        className="w-full bg-card"
                        placeholder="Search by group name or JID"
                        showClear
                      />
                      <ComboboxContent>
                        <ComboboxEmpty>
                          No groups match this search.
                        </ComboboxEmpty>
                        <ComboboxList>
                          <ComboboxGroup>
                            {visibleGroupOptions.map((group, index) => (
                              <ComboboxItem
                                key={group.value}
                                value={group}
                                index={index}
                              >
                                <div className="flex min-w-0 flex-col gap-0.5">
                                  <span className="truncate font-medium">
                                    {group.label}
                                  </span>
                                  <span className="truncate text-muted-foreground">
                                    {group.value}
                                  </span>
                                </div>
                              </ComboboxItem>
                            ))}
                          </ComboboxGroup>
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>

                    <div className="flex justify-end">
                      <Button
                        onClick={handleSaveGroupJid}
                        disabled={!groupJidDirty || mutation.isPending}
                      >
                        {mutation.isPending ? (
                          <Spinner data-icon="inline-start" />
                        ) : null}
                        Save filter
                      </Button>
                    </div>
                  </>
                ) : (
                  <Alert>
                    <InfoIcon />
                    <AlertTitle>No groups available</AlertTitle>
                    <AlertDescription>
                      Sync WhatsApp groups first, then pick one here and save
                      it.
                    </AlertDescription>
                  </Alert>
                )}
              </FieldContent>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card className="border-border/80 bg-card/80">
        <CardHeader className="gap-3">
          <div className="flex items-center gap-2">
            <DownloadIcon className="text-muted-foreground" />
            <CardTitle>Export &amp; Import</CardTitle>
          </div>
          <CardDescription>
            Back up your bookmarks or import from another source.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  exportBookmarks("json").then(() => toast.success("Exported as JSON")).catch(() => toast.error("Export failed"));
                }}
              >
                <DownloadIcon data-icon="inline-start" />
                Export JSON
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  exportBookmarks("html").then(() => toast.success("Exported as HTML")).catch(() => toast.error("Export failed"));
                }}
              >
                <DownloadIcon data-icon="inline-start" />
                Export HTML (Netscape)
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".json";
                  input.onchange = async () => {
                    const file = input.files?.[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      const data = JSON.parse(text);
                      const result = await importBookmarks(data);
                      toast.success(`Imported ${result.imported} bookmarks (${result.skipped} skipped)`);
                      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
                    } catch {
                      toast.error("Import failed — check file format");
                    }
                  };
                  input.click();
                }}
              >
                <UploadIcon data-icon="inline-start" />
                Import JSON
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
