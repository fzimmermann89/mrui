import { useState } from "react";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { MainLayout } from "@/components/layout/MainLayout";
import { NewJobForm } from "@/components/jobs/NewJobForm";
import { JobDetail } from "@/components/jobs/JobDetail";

// Root route with layout
const rootRoute = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [showNewJob, setShowNewJob] = useState(false);

  const handleSelectJob = (jobId: string | null) => {
    setSelectedJobId(jobId);
    setShowNewJob(false);
  };

  const handleNewJob = () => {
    setSelectedJobId(null);
    setShowNewJob(true);
  };

  const handleJobCreated = (jobId: string) => {
    setSelectedJobId(jobId);
    setShowNewJob(false);
  };

  return (
    <MainLayout
      selectedJobId={selectedJobId}
      onSelectJob={handleSelectJob}
      onNewJob={handleNewJob}
    >
      {showNewJob ? (
        <NewJobForm onSuccess={handleJobCreated} />
      ) : selectedJobId ? (
        <JobDetail jobId={selectedJobId} />
      ) : (
        <EmptyState onNewJob={handleNewJob} />
      )}
      <Outlet />
    </MainLayout>
  );
}

function EmptyState({ onNewJob }: { onNewJob: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-[var(--color-muted-foreground)]">
      <div className="text-center max-w-sm">
        <p className="text-sm mb-4">
          Select a job from the sidebar or create a new reconstruction job.
        </p>
        <button
          onClick={onNewJob}
          className="text-sm text-[var(--color-primary)] hover:underline"
        >
          Create your first job →
        </button>
      </div>
    </div>
  );
}

// Index route
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => null, // Content handled by RootComponent state
});

const routeTree = rootRoute.addChildren([indexRoute]);

// eslint-disable-next-line react-refresh/only-export-components
export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouterProvider() {
  return <RouterProvider router={router} />;
}
