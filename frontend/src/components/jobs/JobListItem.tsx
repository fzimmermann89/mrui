import { Trash2, Ban } from "lucide-react";
import { type MouseEvent, useMemo } from "react";
import { useAbortJob, useDeleteJob, useAlgorithms } from "@/api/client";
import type { Job, JobStatus } from "@/types";
import { cn } from "@/lib/utils";

interface JobListItemProps {
  job: Job;
  isSelected: boolean;
  onSelect: () => void;
  index?: number;
}

const statusConfig: Record<
  JobStatus,
  { color: string; label: string; animate?: boolean }
> = {
  started: {
    color: "bg-[var(--color-status-started)]",
    label: "Running",
    animate: true,
  },
  finished: {
    color: "bg-[var(--color-status-finished)]",
    label: "Complete",
  },
  failed: {
    color: "bg-[var(--color-status-failed)]",
    label: "Failed",
  },
  stopped: {
    color: "bg-[var(--color-status-failed)]",
    label: "Stopped",
  },
  canceled: {
    color: "bg-[var(--color-status-failed)]",
    label: "Canceled",
  },
  queued: {
    color: "bg-[var(--color-status-queued)]",
    label: "Queued",
  },
  deferred: {
    color: "bg-[var(--color-status-queued)]",
    label: "Deferred",
  },
  scheduled: {
    color: "bg-[var(--color-status-queued)]",
    label: "Scheduled",
  },
};

const ALGO_SHORT: Record<string, string> = {
  reco_fft: "FFT",
  reco_iterative: "ITER",
  reco_grappa: "GRAPPA",
  reco_sense: "SENSE",
  reco_compressed_sensing: "CS",
};

function getAlgoShort(algorithmId: string, algorithmName?: string): string {
  if (ALGO_SHORT[algorithmId]) return ALGO_SHORT[algorithmId];
  if (algorithmName) {
    const short = algorithmName.split(/\s+/)[0]?.slice(0, 5).toUpperCase();
    if (short) return short;
  }
  return algorithmId.replace(/^reco_/, "").slice(0, 4).toUpperCase();
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function JobListItem({ job, isSelected, onSelect, index = 0 }: JobListItemProps) {
  const isResultMissing = job.status === "finished" && job.result_available === false;

  const config = isResultMissing
    ? { color: "bg-[var(--color-muted-foreground)]", label: "Missing" }
    : statusConfig[job.status];

  const { mutate: abortJob, isPending: isAborting } = useAbortJob();
  const { mutate: deleteJob, isPending: isDeleting } = useDeleteJob();
  const { data: algorithmsData } = useAlgorithms();

  const algorithmInfo = useMemo(() => {
    const algorithms = algorithmsData?.algorithms ?? [];
    return algorithms.find((alg) => alg.id === job.algorithm);
  }, [algorithmsData, job.algorithm]);

  const algoShort = getAlgoShort(job.algorithm, algorithmInfo?.name);
  const relativeTime = useMemo(
    () => formatRelativeTime(new Date(job.created_at)),
    [job.created_at]
  );

  const handleAbort = (e: MouseEvent) => {
    e.stopPropagation();
    abortJob(job.id);
  };

  const handleDelete = (e: MouseEvent) => {
    e.stopPropagation();
    deleteJob(job.id);
  };

  const showAbort = ["queued", "deferred", "scheduled", "started"].includes(job.status);
  const showDelete = ["finished", "failed", "canceled", "stopped"].includes(job.status);

  const animationDelay = `${index * 30}ms`;

  return (
    <div
      onClick={onSelect}
      className={cn(
        "job-item w-full text-left px-2.5 py-2 cursor-pointer group animate-in fade-in slide-in-from-left-1",
        isSelected && "job-item-selected",
        isResultMissing && "opacity-50"
      )}
      style={{ animationDelay, animationFillMode: "backwards" }}
    >
      {/* Single row: dot + name + meta + actions */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "w-[5px] h-[5px] rounded-full shrink-0",
            config.color,
            !isResultMissing && statusConfig[job.status]?.animate && "animate-pulse-slow"
          )}
          title={config.label}
        />

        <span className="text-[13px] font-medium truncate flex-1 leading-tight">
          {job.name}
        </span>

        {/* Actions - appear on hover */}
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {showAbort && (
            <button
              onClick={handleAbort}
              disabled={isAborting}
              className="p-0.5 hover:text-[var(--color-destructive)] transition-colors rounded"
              title="Abort"
            >
              <Ban className="w-3 h-3" />
            </button>
          )}
          {showDelete && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-0.5 hover:text-[var(--color-destructive)] transition-colors rounded"
              title="Delete"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Second row: algo + time (hidden on small screens) */}
      <div className="tablet-up flex items-center gap-1.5 mt-1 ml-[13px]">
        <span className="algo-badge">{algoShort}</span>
        <span className="desktop-only text-[10px] text-[var(--color-muted-foreground)] tabular-nums font-mono">
          {relativeTime}
        </span>
      </div>
    </div>
  );
}
