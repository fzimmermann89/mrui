import { useState } from "react";
import { useJob, useAlgorithms } from "@/api/client";
import { getDownloadUrl, getInputDownloadUrl } from "@/api/client";
import { Download, ChevronDown, Loader2, AlertCircle, FileText, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ALGORITHM_UI } from "@/components/algorithms/registry";
import type { AlgorithmParamRow } from "@/components/algorithms/types";
import { VolumeViewer } from "@/components/viewer/VolumeViewer";
import type { AlgorithmParams, JobStatus } from "@/types";

interface JobDetailProps {
  jobId: string;
}

const statusConfig: Record<JobStatus, { label: string; color: string }> = {
  queued: { label: "Queued", color: "var(--color-status-queued)" },
  deferred: { label: "Deferred", color: "var(--color-status-queued)" },
  scheduled: { label: "Scheduled", color: "var(--color-status-queued)" },
  started: { label: "Processing", color: "var(--color-status-started)" },
  finished: { label: "Complete", color: "var(--color-status-finished)" },
  failed: { label: "Failed", color: "var(--color-status-failed)" },
  stopped: { label: "Stopped", color: "var(--color-status-failed)" },
  canceled: { label: "Canceled", color: "var(--color-status-queued)" },
};

function formatParamLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatParamValue(value: unknown): string {
  if (Array.isArray(value)) {
    const numeric = value.every((item) => typeof item === "number");
    return numeric ? value.join("×") : value.join(", ");
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "–";
  return String(value);
}

function describeParams(params: AlgorithmParams): AlgorithmParamRow[] {
  return Object.entries(params)
    .filter(([key]) => key !== "algorithm")
    .map(([key, value]) => ({
      label: formatParamLabel(key),
      value: formatParamValue(value),
    }));
}

export function JobDetail({ jobId }: JobDetailProps) {
  const { data: job, isLoading, error } = useJob(jobId);
  const { data: algorithmsData } = useAlgorithms();
  const [showLogs, setShowLogs] = useState(false);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted-foreground)]" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--color-destructive)]">
        <AlertCircle className="h-5 w-5 mr-2" />
        Failed to load job
      </div>
    );
  }

  const isFinished = job.status === "finished";
  const isFailed = ["failed", "stopped", "canceled"].includes(job.status);
  const isProcessing = job.status === "started";
  const hasResult = isFinished && job.result_available !== false;

  const status = statusConfig[job.status];
  const algorithms = algorithmsData?.algorithms ?? [];
  const algorithmInfo = algorithms.find((alg) => alg.id === job.algorithm);
  const algorithmName = algorithmInfo?.name ?? job.algorithm;
  const algorithmDescription = algorithmInfo?.description;
  const algorithmUI = ALGORITHM_UI[job.algorithm];
  const paramRows = algorithmUI?.describeParams?.(job.params) ?? describeParams(job.params);
  const paramSummary = paramRows.map((row) => row.value).join(" · ");

  const date = new Date(job.created_at);
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });

  const logs = job.log_messages?.join("\n") ?? "";
  const statusColor = !hasResult && isFinished ? "var(--color-muted-foreground)" : status.color;
  const statusLabel = !hasResult && isFinished ? "Result missing" : status.label;

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 h-12 px-4 border-b border-[var(--color-border)] flex items-center gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold truncate leading-none">
            {job.name}
          </h2>

          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="shrink-0 max-w-[140px] px-1.5 py-0.5 text-[10px] font-medium tracking-wide bg-[var(--color-muted)] text-[var(--color-muted-foreground)] rounded cursor-default truncate"
                  title={paramSummary || undefined}
                >
                  {algorithmName}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <div className="space-y-1.5">
                  <p className="font-semibold">{algorithmName}</p>
                  {algorithmDescription && (
                    <p className="text-[var(--color-muted-foreground)]">
                      {algorithmDescription}
                    </p>
                  )}
                  {paramRows.length > 0 ? (
                    <div className="space-y-1">
                      {paramRows.map((row) => (
                        <div key={row.label} className="flex items-center gap-3">
                          <span className="text-[var(--color-muted-foreground)]">
                            {row.label}
                          </span>
                          <span className="font-mono">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[var(--color-muted-foreground)]">No parameters</p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex items-center gap-4 text-[11px] text-[var(--color-muted-foreground)]">
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: statusColor }}
            />
            <span className="font-medium" style={{ color: statusColor }}>
              {statusLabel}
            </span>
          </div>

          <span className="tabular-nums">
            {dateStr} · {timeStr}
          </span>

          {job.input_filename && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  {job.input_available ? (
                    <a
                      href={getInputDownloadUrl(jobId)}
                      download
                      className="flex items-center gap-1 hover:text-[var(--color-foreground)] transition-colors text-[var(--color-foreground)]"
                    >
                      <FileText className="w-3 h-3" />
                      <span className="max-w-[120px] truncate font-mono text-[10px] underline decoration-dotted decoration-[var(--color-border)] underline-offset-2">
                        {job.input_filename}
                      </span>
                    </a>
                  ) : (
                    <span className="flex items-center gap-1 cursor-not-allowed opacity-50">
                      <FileText className="w-3 h-3" />
                      <span className="max-w-[120px] truncate font-mono text-[10px]">
                        {job.input_filename}
                      </span>
                    </span>
                  )}
                </TooltipTrigger>
                <TooltipContent side="bottom" className="font-mono text-xs">
                  {job.input_filename}
                  {!job.input_available && " (Not available)"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <div className="flex items-center gap-2">
          {(isFinished || isFailed) && logs && (
            <Button
              variant={showLogs ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowLogs(!showLogs)}
              className="h-7 px-2 gap-1 text-[11px] font-medium"
              title="Toggle Logs"
            >
              <ScrollText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logs</span>
            </Button>
          )}

          {isFinished && hasResult && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 gap-1 text-[11px] font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export
                  <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[120px]">
                <DropdownMenuItem asChild className="text-xs">
                  <a href={getDownloadUrl(jobId, "h5")} download>
                    HDF5 (.h5)
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="text-xs">
                  <a href={getDownloadUrl(jobId, "npy")} download>
                    NumPy (.npy)
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="text-xs">
                  <a href={getDownloadUrl(jobId, "nii")} download>
                    NIfTI (.nii)
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {showLogs ? (
          <div className="absolute inset-0 bg-[var(--color-background)] z-10 p-4 overflow-auto">
            <pre className="text-[11px] font-mono whitespace-pre-wrap break-all text-[var(--color-foreground)]">
              {logs}
            </pre>
          </div>
        ) : null}

        {!showLogs && isFinished && hasResult && job.result_shape ? (
          <VolumeViewer jobId={jobId} resultShape={job.result_shape} />
        ) : !showLogs && isFinished && !hasResult ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--color-muted-foreground)]">
            <AlertCircle className="h-8 w-8 mb-3 opacity-50" />
            <p className="text-sm font-medium">Result missing</p>
            <p className="text-xs mt-1 opacity-70">The result files are no longer available.</p>
          </div>
        ) : !showLogs && isProcessing ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--color-muted-foreground)]">
            <Loader2 className="h-8 w-8 animate-spin mb-3" />
            <p className="text-sm">Processing reconstruction...</p>
          </div>
        ) : !showLogs && isFailed ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--color-destructive)] p-8">
            <AlertCircle className="h-8 w-8 mb-3 shrink-0" />
            <p className="text-sm font-medium mb-4 shrink-0">
              Reconstruction {job.status}
            </p>
            {job.error && (
              <div className="w-full max-w-3xl bg-destructive/5 rounded-md border border-destructive/20 overflow-hidden shrink min-h-0 flex flex-col">
                <div className="p-4 overflow-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all text-destructive">
                    {job.error}
                  </pre>
                </div>
              </div>
            )}
          </div>
        ) : !showLogs ? (
          <div className="h-full flex items-center justify-center text-[var(--color-muted-foreground)]">
            <p className="text-sm">Waiting in queue... ({status.label})</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
