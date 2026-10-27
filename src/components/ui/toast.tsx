"use client";

import * as React from "react";
import { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "cn";

export type ToastVariant = "default" | "success" | "destructive" | "info";

export interface ToastOptions {
  id?: string;
  title?: string;
  description: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextType {
  toast: (options: ToastOptions) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastOptions[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ id = `toast-${Date.now()}-${Math.random()}`, duration = 3500, ...rest }: ToastOptions) => {
      setToasts((prev) => [...prev, { id, duration, ...rest }]);

      if (duration > 0) {
        setTimeout(() => {
          dismiss(id);
        }, duration);
      }
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      {/* Toast Viewport Fixed Container */}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2 pointer-events-none"
      >
        {toasts.map((t) => {
          const Icon =
            t.variant === "success"
              ? CheckCircle2
              : t.variant === "destructive"
              ? AlertCircle
              : Info;

          return (
            <div
              key={t.id}
              role="alert"
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-lg backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-2",
                t.variant === "success" &&
                  "border-emerald-500/30 bg-card/95 text-foreground",
                t.variant === "destructive" &&
                  "border-destructive/30 bg-destructive/10 text-destructive",
                (!t.variant || t.variant === "default" || t.variant === "info") &&
                  "border-border bg-card/95 text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0 mt-0.5",
                  t.variant === "success" && "text-emerald-500",
                  t.variant === "destructive" && "text-destructive",
                  (!t.variant || t.variant === "default" || t.variant === "info") &&
                    "text-primary"
                )}
              />

              <div className="flex-1 text-xs">
                {t.title && <p className="font-semibold mb-0.5">{t.title}</p>}
                <p className="opacity-90 leading-relaxed">{t.description}</p>
              </div>

              <button
                type="button"
                onClick={() => dismiss(t.id!)}
                className="shrink-0 p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                aria-label="Dismiss toast"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
