import { useMemo } from "react";
import { useJobs } from "@/api/client";
import { JobListItem } from "./JobListItem";
import type { Job } from "@/types";

interface JobListProps {
  selectedJobId: string | null;
  onSelectJob: (jobId: string | null) => void;
}

type DateGroup = "Today" | "Yesterday" | "This Week" | "Older";

function getDateGroup(date: Date): DateGroup {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  
  const jobDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
  if (jobDate.getTime() >= today.getTime()) return "Today";
  if (jobDate.getTime() >= yesterday.getTime()) return "Yesterday";
  if (jobDate.getTime() >= weekAgo.getTime()) return "This Week";
  return "Older";
}

function groupJobsByDate(jobs: Job[]): Map<DateGroup, Job[]> {
  const groups = new Map<DateGroup, Job[]>();
  const order: DateGroup[] = ["Today", "Yesterday", "This Week", "Older"];
  
  for (const group of order) {
    groups.set(group, []);
  }
  
  for (const job of jobs) {
    const group = getDateGroup(new Date(job.created_at));
    groups.get(group)!.push(job);
  }
  
  return groups;
}

function DateGroupHeader({ label }: { label: string }) {
  return (
    <div className="px-2.5 pt-3 pb-1 first:pt-0">
      <span className="text-[9px] font-medium uppercase tracking-widest text-[var(--color-muted-foreground)]">
        {label}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-10 h-10 rounded-full bg-[var(--color-muted)] flex items-center justify-center mb-3">
        <svg className="w-5 h-5 text-[var(--color-muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </div>
      <p className="text-xs text-[var(--color-muted-foreground)]">No jobs yet</p>
      <p className="text-[10px] text-[var(--color-muted-foreground)] opacity-60 mt-0.5">Create one to get started</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-1 p-2">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="flex items-center gap-2 px-2.5 py-2">
            <div className="w-[5px] h-[5px] rounded-full bg-[var(--color-muted)]" />
            <div className="flex-1 h-3.5 bg-[var(--color-muted)] rounded" />
          </div>
          <div className="flex items-center gap-1.5 ml-[21px] mt-1">
            <div className="w-10 h-4 bg-[var(--color-muted)] rounded" />
            <div className="w-6 h-3 bg-[var(--color-muted)] rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function JobList({ selectedJobId, onSelectJob }: JobListProps) {
  const { data, isLoading, error } = useJobs();

  const groupedJobs = useMemo(() => {
    const jobs = data?.jobs || [];
    const sorted = [...jobs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return groupJobsByDate(sorted);
  }, [data?.jobs]);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
        <div className="w-8 h-8 rounded-full bg-[var(--color-destructive)]/10 flex items-center justify-center mb-2">
          <svg className="w-4 h-4 text-[var(--color-destructive)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-xs text-[var(--color-destructive)]">Failed to load</p>
      </div>
    );
  }

  const jobs = data?.jobs || [];
  if (jobs.length === 0) {
    return <EmptyState />;
  }

  const groupOrder: DateGroup[] = ["Today", "Yesterday", "This Week", "Older"];
  
  return (
    <div>
      {groupOrder.map((group) => {
        const groupJobs = groupedJobs.get(group) || [];
        if (groupJobs.length === 0) return null;
        
        return (
          <div key={group}>
            <DateGroupHeader label={group} />
            <div className="space-y-0.5">
              {groupJobs.map((job, index) => (
                <JobListItem
                  key={job.id}
                  job={job}
                  isSelected={job.id === selectedJobId}
                  onSelect={() => onSelectJob(job.id)}
                  index={index}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
