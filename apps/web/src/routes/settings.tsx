import { createFileRoute } from "@tanstack/react-router";
import { Settings2Icon } from "lucide-react";

import { Badge } from "@bookmark/ui/components/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@bookmark/ui/components/card";
import { WhatsAppConnectionSettings } from "../components/settings/WhatsAppConnectionSettings";
import { WhatsAppGroupSettings } from "../components/settings/WhatsAppGroupSettings";
import { WhatsAppCommandsInfo } from "../components/settings/WhatsAppCommandsInfo";
import { ImportBookmarks } from "../components/settings/ImportBookmarks";
import { DigestSettings } from "../components/settings/DigestSettings";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <Card className="border-border/80 bg-card/85 shadow-sm">
        <CardHeader className="gap-3">
          <Badge variant="secondary" className="w-fit">
            <Settings2Icon data-icon="inline-start" />
            Workspace
          </Badge>
          <CardTitle className="text-3xl tracking-tight">Settings</CardTitle>
          <CardDescription className="max-w-2xl">
            Connect WhatsApp, control which chats create bookmarks, and manage
            your data.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <WhatsAppConnectionSettings />
        <WhatsAppGroupSettings />
      </div>
      <WhatsAppCommandsInfo />
      <DigestSettings />
      <ImportBookmarks />
    </div>
  );
}
