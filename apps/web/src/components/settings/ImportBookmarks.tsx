import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  UploadIcon,
  FileIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  SparklesIcon,
  LoaderIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@bookmark/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@bookmark/ui/components/card";
import {
  importBookmarks,
  getImportStatus,
  dismissImportStatus,
  type ImportResult,
} from "../../utils/api";

export function ImportBookmarks() {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localResult, setLocalResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Poll import + enrichment status
  const { data: statusData } = useQuery({
    queryKey: ["import-status"],
    queryFn: getImportStatus,
    refetchInterval: (query) => {
      const state = query.state.data?.import?.state;
      const pending = query.state.data?.enrichment?.pending ?? 0;
      // Poll fast during import, slower for enrichment, stop when idle+done
      if (state === "importing") return 2000;
      if (pending > 0) return 10000;
      return false;
    },
  });

  const importState = statusData?.import;
  const enrichment = statusData?.enrichment ?? {};
  const pendingCount = enrichment.pending ?? 0;
  const completeCount = enrichment.complete ?? 0;
  const failedCount = enrichment.failed ?? 0;
  const totalEnrichable = pendingCount + completeCount + failedCount;

  const mutation = useMutation({
    mutationFn: (file: File) => importBookmarks(file),
    onMutate: () => {
      setLocalResult(null);
    },
    onSuccess: (data) => {
      setLocalResult(data);
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: ["import-status"] });
      toast.success(`Imported ${data.imported} bookmarks`);
    },
    onError: (err) => {
      toast.error(err.message);
      queryClient.invalidateQueries({ queryKey: ["import-status"] });
    },
  });

  function handleFile(file: File) {
    if (!file.name.endsWith(".html") && !file.name.endsWith(".htm")) {
      toast.error("Please upload an HTML file exported from your browser");
      return;
    }
    setSelectedFile(file);
    setLocalResult(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  const dismissMutation = useMutation({
    mutationFn: dismissImportStatus,
    onSuccess: () => {
      setLocalResult(null);
      queryClient.invalidateQueries({ queryKey: ["import-status"] });
    },
  });

  // Show server-side result if we don't have a local one (page was closed and reopened)
  const displayResult = localResult ?? importState?.result ?? null;
  const isImporting = mutation.isPending || importState?.state === "importing";
  const serverProgress = importState?.progress;

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

        {/* Drop zone — hide during active import */}
        {!isImporting && (
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
        )}

        {/* Selected file */}
        {selectedFile && !isImporting && (
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
              Import
            </Button>
          </div>
        )}

        {/* Import progress */}
        {isImporting && (
          <div className="rounded-lg bg-muted/50 px-4 py-4 space-y-3">
            <div className="flex items-center gap-2">
              <LoaderIcon className="size-4 animate-spin text-primary" />
              <span className="text-sm font-medium">Importing bookmarks...</span>
            </div>
            {serverProgress && (
              <>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(serverProgress.done / serverProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {serverProgress.done} of {serverProgress.total} processed
                </p>
              </>
            )}
            <p className="text-xs text-muted-foreground">
              You can close this page — the import will continue on the server.
            </p>
          </div>
        )}

        {/* Import result */}
        {!isImporting && displayResult && (
          <div className="rounded-lg bg-muted/50 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {displayResult.failed === 0 ? (
                  <CheckCircle2Icon className="size-4 text-green-500" />
                ) : (
                  <AlertCircleIcon className="size-4 text-yellow-500" />
                )}
                <span className="text-sm font-medium">Import complete</span>
              </div>
              <button
                type="button"
                onClick={() => dismissMutation.mutate()}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Dismiss
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>Total in file:</span>
              <span className="font-medium text-foreground">{displayResult.total}</span>
              <span>Imported:</span>
              <span className="font-medium text-foreground">{displayResult.imported}</span>
              <span>Duplicates skipped:</span>
              <span className="font-medium text-foreground">{displayResult.duplicates}</span>
              {displayResult.failed > 0 && (
                <>
                  <span>Failed:</span>
                  <span className="font-medium text-destructive">{displayResult.failed}</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* AI enrichment status */}
        {totalEnrichable > 0 && (
          <div className="rounded-lg bg-muted/50 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <SparklesIcon className="size-4 text-primary" />
              <span className="text-sm font-medium">AI Enrichment</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-500"
                style={{ width: `${(completeCount / totalEnrichable) * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {completeCount} of {totalEnrichable} bookmarks enriched
              </span>
              {pendingCount > 0 && (
                <span className="flex items-center gap-1">
                  <LoaderIcon className="size-3 animate-spin" />
                  {pendingCount} pending
                </span>
              )}
            </div>
            {pendingCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Processing ~10 every 5 minutes in the background.
              </p>
            )}
            {failedCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {failedCount} failed (will retry up to 3 times).
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
