import * as React from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Info, TriangleAlert, XCircle, X } from "lucide-react";
import { cn } from "../../lib/utils";

type ToastVariant = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (input: { title: string; description?: string; variant?: ToastVariant }) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = React.useCallback(
    ({ title, description, variant = "info" }: { title: string; description?: string; variant?: ToastVariant }) => {
      const id = ++counter;
      setItems((current) => [...current.slice(-3), { id, title, description, variant }]);
      window.setTimeout(() => dismiss(id), 6000);
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite" aria-atomic="false">
          {items.map((item) => {
            const Icon =
              item.variant === "success" ? CheckCircle2 : item.variant === "error" ? XCircle : item.variant === "warning" ? TriangleAlert : Info;
            return (
              <div
                key={item.id}
                className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-white p-3.5 shadow-pop animate-fade-in"
                role={item.variant === "error" ? "alert" : "status"}
              >
                <Icon
                  size={18}
                  className={cn(
                    "mt-0.5 shrink-0",
                    item.variant === "success" && "text-success",
                    item.variant === "error" && "text-danger",
                    item.variant === "warning" && "text-warning",
                    item.variant === "info" && "text-info",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink">{item.title}</p>
                  {item.description ? <p className="mt-0.5 text-[12px] leading-relaxed text-ink-secondary">{item.description}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="rounded p-1 text-ink-secondary hover:bg-app"
                  aria-label="Dismiss notification"
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
