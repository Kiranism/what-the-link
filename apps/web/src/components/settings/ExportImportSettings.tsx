import { useQueryClient } from "@tanstack/react-query";
import { DownloadIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@bookmark/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@bookmark/ui/components/card";
import { exportBookmarks, importBookmarks } from "../../utils/api";

function handleImportJson(queryClient: ReturnType<typeof useQueryClient>) {
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
}

export function ExportImportSettings() {
  const queryClient = useQueryClient();

  return (
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
                exportBookmarks("json")
                  .then(() => toast.success("Exported as JSON"))
                  .catch(() => toast.error("Export failed"));
              }}
            >
              <DownloadIcon data-icon="inline-start" />
              Export JSON
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                exportBookmarks("html")
                  .then(() => toast.success("Exported as HTML"))
                  .catch(() => toast.error("Export failed"));
              }}
            >
              <DownloadIcon data-icon="inline-start" />
              Export HTML (Netscape)
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => handleImportJson(queryClient)}
            >
              <UploadIcon data-icon="inline-start" />
              Import JSON
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
