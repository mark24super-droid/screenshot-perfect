import * as React from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Workflow } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/Button";

export function PublicLayout({
  children,
  title,
  eyebrow,
}: {
  children: React.ReactNode;
  title?: string;
  eyebrow?: string;
}) {
  const { user } = useAuth();
  const location = useLocation();

  React.useEffect(() => {
    if (location.hash) {
      const id = location.hash.slice(1);
      window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 60);
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [location.pathname, location.hash]);

  return (
    <div className="flex min-h-screen flex-col bg-white text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5" aria-label="FlowMate AI home">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white shadow-sm">
              <Workflow size={17} strokeWidth={2.2} />
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.01em]">FlowMate AI</span>
          </Link>
          <nav className="ml-4 hidden items-center gap-5 text-[13px] text-ink-secondary sm:flex" aria-label="Public navigation">
            <Link to="/help" className="hover:text-ink">
              Help
            </Link>
            <Link to="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-ink">
              Terms
            </Link>
            <Link to="/contact" className="hover:text-ink">
              Contact
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <Link to="/dashboard">
                <Button size="sm">Open dashboard</Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm">
                    Log in
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm">Start free</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
          <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-[12px] text-ink-secondary hover:text-ink">
            <ArrowLeft size={13} /> Back to home
          </Link>
          {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">{eyebrow}</p> : null}
          {title ? <h1 className="mt-1 text-[28px] font-semibold tracking-[-0.02em] text-ink sm:text-[32px]">{title}</h1> : null}
          <div className={title ? "mt-6" : ""}>{children}</div>
        </div>
      </main>

      <footer className="border-t border-line bg-app">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-6 text-[12px] text-ink-secondary sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} FlowMate AI. Built as a working automation platform.</p>
          <nav className="flex flex-wrap gap-4" aria-label="Legal and support">
            <Link to="/help" className="hover:text-ink">
              Help
            </Link>
            <Link to="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-ink">
              Terms
            </Link>
            <Link to="/contact" className="hover:text-ink">
              Contact
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
