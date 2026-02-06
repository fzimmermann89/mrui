import { type ReactNode, useEffect, useState } from "react";
import { Plus, Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobList } from "@/components/jobs/JobList";

interface MainLayoutProps {
  children: ReactNode;
  selectedJobId: string | null;
  onSelectJob: (jobId: string | null) => void;
  onNewJob: () => void;
}

type Theme = "light" | "dark" | "system";

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem("theme") as Theme) || "system";
  });

  useEffect(() => {
    const root = document.documentElement;
    
    const applyTheme = (t: Theme) => {
      root.classList.remove("light", "dark");
      root.removeAttribute("data-theme");
      
      if (t === "light") {
        root.classList.add("light");
        root.setAttribute("data-theme", "light");
      } else if (t === "dark") {
        root.classList.add("dark");
        root.setAttribute("data-theme", "dark");
      }
      // "system" - let CSS media query handle it
    };
    
    applyTheme(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return { theme, setTheme };
}

function ThemeToggle({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const cycleTheme = () => {
    const next: Theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
  };

  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const label = theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System";

  return (
    <button
      onClick={cycleTheme}
      className="theme-toggle"
      title={`Theme: ${label}`}
      aria-label={`Current theme: ${label}. Click to cycle.`}
    >
      <Icon />
    </button>
  );
}

export function MainLayout({
  children,
  selectedJobId,
  onSelectJob,
  onNewJob,
}: MainLayoutProps) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="h-screen flex flex-col bg-[var(--color-background)]">
      {/* Header - minimal, refined */}
      <header className="h-11 shrink-0 border-b border-[var(--color-border)] flex items-center justify-between px-3 relative">
        <div className="flex items-center gap-2">
          <img 
            src="https://mrpro.rocks/logo.svg" 
            className="h-5 w-5" 
            alt="MRui" 
          />
          <h1 className="text-sm font-semibold tracking-tight">MRui</h1>
        </div>
        
        <div className="flex items-center gap-1">
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>
        
        {/* Accent line */}
        <div className="header-accent-line" />
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 sidebar-responsive shrink-0 border-r border-[var(--color-sidebar-border)] bg-[var(--color-sidebar)] flex flex-col">
          {/* Section header */}
          <div className="section-header">Jobs</div>
          
          {/* Job list */}
          <div className="flex-1 overflow-y-auto px-1">
            <JobList selectedJobId={selectedJobId} onSelectJob={onSelectJob} />
          </div>
          
          {/* New job button */}
          <div className="p-2 border-t border-[var(--color-sidebar-border)]">
            <Button 
              size="sm" 
              onClick={onNewJob} 
              className="w-full gap-1.5 justify-center h-8 text-xs font-medium"
            >
              <Plus className="h-3.5 w-3.5" />
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
