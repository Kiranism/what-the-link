import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { InfoIcon, RefreshCwIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@bookmark/ui/components/alert";
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
  FieldGroup,
  FieldLabel,
} from "@bookmark/ui/components/field";
import { Spinner } from "@bookmark/ui/components/spinner";
import {
  fetchSettings,
  fetchWhatsAppGroups,
  refreshWhatsAppGroups,
  updateSettings,
} from "../../utils/api";

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

export function WhatsAppGroupSettings() {
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
      setOverride(null);
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

  // Derive waGroupJid from server data with local override when user picks a new group
  const [override, setOverride] = useState<string | null>(null);
  const waGroupJid = override ?? settings?.waAllowedGroupJid ?? "";

  const groupOptions: GroupOption[] = groups.map((group) => ({
    label: group.name || group.jid,
    value: group.jid,
    searchText: `${group.name || ""} ${group.jid}`.toLowerCase(),
  }));

  const selectedGroup =
    groupOptions.find((group) => group.value === waGroupJid) ?? null;

  // Derive groupQuery from selectedGroup label unless user is actively searching
  const [searchOverride, setSearchOverride] = useState<string | null>(null);
  const groupQuery = searchOverride ?? selectedGroup?.label ?? "";
  const deferredGroupQuery = useDeferredValue(groupQuery);

  const normalizedQuery = deferredGroupQuery.trim().toLowerCase();
  const matchedGroupOptions = normalizedQuery
    ? groupOptions.filter((group) => group.searchText.includes(normalizedQuery))
    : groupOptions;
  const visibleGroupOptions = matchedGroupOptions.slice(0, 10);

  const groupJidDirty =
    (settings?.waAllowedGroupJid ?? "") !== (waGroupJid.trim() || "");

  const handleSaveGroupJid = () => {
    const value = waGroupJid.trim() || null;
    mutation.mutate({ waAllowedGroupJid: value });
  };

  return (
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
            <RefreshCwIcon
              className={refreshGroupsMutation.isPending ? "animate-spin" : ""}
              data-icon="inline-start"
            />
            Refresh groups
          </Button>
        </div>
        <CardDescription>
          Search known groups locally and save a single group filter. Press{" "}
          {"\u201c"}Refresh groups{"\u201d"} to re-fetch the latest list from
          WhatsApp.
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
                    onInputValueChange={(value) => setSearchOverride(value)}
                    onValueChange={(value) => {
                      setOverride(value?.value ?? "");
                      setSearchOverride(null);
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
                      placeholder="Search by group name or JID\u2026"
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
                      Save
                    </Button>
                  </div>
                </>
              ) : (
                <Alert>
                  <InfoIcon />
                  <AlertTitle>No groups available</AlertTitle>
                  <AlertDescription>
                    Sync WhatsApp groups first, then pick one here and save it.
                  </AlertDescription>
                </Alert>
              )}
            </FieldContent>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
