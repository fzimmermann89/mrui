import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobList } from "@/components/jobs/JobList";

interface MainLayoutProps {
  children: ReactNode;
  selectedJobId: string | null;
  onSelectJob: (jobId: string | null) => void;
  onNewJob: () => void;
}

export function MainLayout({
  children,
  selectedJobId,
  onSelectJob,
  onNewJob,
}: MainLayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-[var(--color-background)]">
      {/* Header */}
      <header className="h-12 shrink-0 border-b border-[var(--color-border)] flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <img src="https://mrpro.rocks/logo.svg" className="h-6 w-6" alt="MRui Logo" />
          <h1 className="text-base font-semibold tracking-tight">MRui</h1>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r border-[var(--color-sidebar-border)] bg-[var(--color-sidebar)] flex flex-col">
          <div className="flex-1 overflow-y-auto p-2">
            <JobList selectedJobId={selectedJobId} onSelectJob={onSelectJob} />
          </div>
          <div className="p-2 border-t border-[var(--color-sidebar-border)]">
            <Button size="sm" onClick={onNewJob} className="w-full gap-1.5 justify-start">
              <Plus className="h-4 w-4" />
              New Job
            </Button>
          </div>
        </aside>

        {/* Main area */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
