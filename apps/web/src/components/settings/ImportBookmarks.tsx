import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UploadIcon, FileIcon, CheckCircle2Icon, AlertCircleIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@bookmark/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@bookmark/ui/components/card";
import { importBookmarks, type ImportResult } from "../../utils/api";

export function ImportBookmarks() {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (file: File) => importBookmarks(file),
    onSuccess: (data) => {
      setResult(data);
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast.success(`Imported ${data.imported} bookmarks`);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  function handleFile(file: File) {
    if (!file.name.endsWith(".html") && !file.name.endsWith(".htm")) {
      toast.error("Please upload an HTML file exported from your browser");
      return;
    }
    setSelectedFile(file);
    setResult(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <Card className="border-border/80 bg-card/85 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UploadIcon className="size-5" />
          Import Bookmarks
        </CardTitle>
        <CardDescription>
          Import bookmarks from Chrome, Brave, Firefox, or Safari. Export your
          bookmarks as HTML from your browser, then upload the file here.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* How to export hint */}
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground transition-colors">
            How to export bookmarks
          </summary>
          <ol className="mt-2 ml-4 space-y-1 list-decimal">
            <li>Open Chrome/Brave &rarr; Bookmark Manager (Ctrl+Shift+O)</li>
            <li>Click the three-dot menu &rarr; <strong>Export bookmarks</strong></li>
            <li>Save the HTML file, then upload it below</li>
          </ol>
        </details>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border/60 hover:border-border hover:bg-muted/30"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".html,.htm"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
          <UploadIcon className="size-8 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium">
              Drop your bookmark HTML file here
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              or click to browse
            </p>
          </div>
        </div>

        {/* Selected file */}
        {selectedFile && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <FileIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-sm truncate">{selectedFile.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {(selectedFile.size / 1024).toFixed(0)} KB
              </span>
            </div>
            <Button
              size="sm"
              onClick={() => mutation.mutate(selectedFile)}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Importing..." : "Import"}
            </Button>
          </div>
        )}

        {/* Progress */}
        {mutation.isPending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Processing bookmarks... This may take a while for large files.
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="rounded-lg bg-muted/50 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              {result.failed === 0 ? (
                <CheckCircle2Icon className="size-4 text-green-500" />
              ) : (
                <AlertCircleIcon className="size-4 text-yellow-500" />
              )}
              <span className="text-sm font-medium">Import complete</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>Total in file:</span>
              <span className="font-medium text-foreground">{result.total}</span>
              <span>Imported:</span>
              <span className="font-medium text-foreground">{result.imported}</span>
              <span>Duplicates skipped:</span>
              <span className="font-medium text-foreground">{result.duplicates}</span>
              {result.failed > 0 && (
                <>
                  <span>Failed:</span>
                  <span className="font-medium text-destructive">{result.failed}</span>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              AI summaries and tags are being generated in the background.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
