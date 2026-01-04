import { useJobs } from "@/api/client";
import { JobListItem } from "./JobListItem";

interface JobListProps {
  selectedJobId: string | null;
  onSelectJob: (jobId: string | null) => void;
}

export function JobList({ selectedJobId, onSelectJob }: JobListProps) {
  const { data, isLoading, error } = useJobs();

  if (isLoading) {
    return (
      <div className="px-2 py-3 text-sm text-[var(--color-muted-foreground)]">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-2 py-3 text-sm text-[var(--color-destructive)]">
        Failed to load jobs
      </div>
    );
  }

  const jobs = data?.jobs || [];

  if (jobs.length === 0) {
    return (
      <div className="px-2 py-3 text-sm text-[var(--color-muted-foreground)]">
        No jobs yet
      </div>
    );
  }

  // Sort by created_at descending (newest first)
  const sortedJobs = [...jobs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="space-y-0.5">
      {sortedJobs.map((job) => (
        <JobListItem
          key={job.id}
          job={job}
          isSelected={job.id === selectedJobId}
          onSelect={() => onSelectJob(job.id)}
        />
      ))}
    </div>
  );
}
