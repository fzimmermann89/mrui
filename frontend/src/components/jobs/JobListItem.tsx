import { Trash2, Ban } from "lucide-react";
import { type MouseEvent } from "react";
import { useAbortJob, useDeleteJob } from "@/api/client";
import type { Job, JobStatus } from "@/types";
import { cn } from "@/lib/utils";

interface JobListItemProps {
  job: Job;
  isSelected: boolean;
  onSelect: () => void;
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
    label: "Finished",
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

export function JobListItem({ job, isSelected, onSelect }: JobListItemProps) {
  const isResultMissing = job.status === "finished" && job.result_available === false;

  const config = isResultMissing
    ? { color: "bg-[var(--color-muted-foreground)]", label: "Result missing" }
    : statusConfig[job.status];

  const { mutate: abortJob, isPending: isAborting } = useAbortJob();
  const { mutate: deleteJob, isPending: isDeleting } = useDeleteJob();

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

  return (
    <div
      onClick={onSelect}
      className={cn(
        "w-full text-left px-2 py-1.5 rounded-[var(--radius-sm)] flex items-center gap-2 transition-colors cursor-pointer group",
        isSelected
          ? "bg-[var(--color-sidebar-accent)]"
          : "hover:bg-[var(--color-sidebar-accent)]/50",
        isResultMissing && "opacity-60 grayscale"
      )}
    >
      <span
        className={cn(
          "w-2 h-2 rounded-full shrink-0",
          config.color,
          !isResultMissing && statusConfig[job.status]?.animate && "animate-pulse-slow"
        )}
        title={config.label}
      />

      <span className="text-sm truncate flex-1">{job.name}</span>

      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
        {showAbort && (
          <button
            onClick={handleAbort}
            disabled={isAborting}
            className="p-1 hover:text-[var(--color-destructive)] transition-colors rounded-full hover:bg-[var(--color-sidebar-accent)]"
            title="Abort Job"
          >
            <Ban className="w-3.5 h-3.5" />
          </button>
        )}
        {showDelete && (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-1 hover:text-[var(--color-destructive)] transition-colors rounded-full hover:bg-[var(--color-sidebar-accent)]"
            title="Delete Job"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
