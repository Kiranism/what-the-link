import { MessageCircleQuestionIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@bookmark/ui/components/card";

const commands = [
  {
    label: "Save a bookmark",
    description: "Send any URL to save it",
    examples: [
      "https://example.com",
      "https://example.com #design #inspiration",
      "https://example.com !fav",
    ],
  },
  {
    label: "Search bookmarks",
    description: "Find saved bookmarks by text, tag, or status",
    examples: [
      "search react hooks",
      "search #tutorial",
      "search fav",
      "search recent",
      "?react tutorials",
    ],
  },
  {
    label: "Reply commands",
    description: "Reply to a saved bookmark message with:",
    examples: ["delete", "archive", "fav", "unfav"],
  },
  {
    label: "Help",
    description: "Show available commands",
    examples: ["help", "/help"],
  },
];

export function WhatsAppCommandsInfo() {
  return (
    <Card className="border-border/80 bg-card/80">
      <CardHeader className="gap-3">
        <div className="flex items-center gap-2">
          <MessageCircleQuestionIcon className="text-muted-foreground" />
          <CardTitle>WhatsApp Commands</CardTitle>
        </div>
        <CardDescription>
          Commands available in your linked WhatsApp chat.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {commands.map((cmd) => (
            <div key={cmd.label} className="space-y-1.5">
              <div>
                <span className="text-sm font-medium">{cmd.label}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {cmd.description}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {cmd.examples.map((ex) => (
                  <code
                    key={ex}
                    className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {ex}
                  </code>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
