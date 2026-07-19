"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";

export type ToastKind = "info" | "success" | "error";
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastCtx {
  push: (message: string, kind?: ToastKind) => void;
}

const ctx = createContext<ToastCtx | null>(null);

/**
 * Toast global. Remplace les `alert()` moches. Empile en bas à droite,
 * s'auto-dismiss à 4 s, cliquable pour dismiss immédiat.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, message }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-72 flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ctx.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const styles: Record<ToastKind, { border: string; icon: string; iconColor: string }> = {
    info: {
      border: "border-slate-200",
      icon: "ti-info-circle",
      iconColor: "text-slate-500",
    },
    success: {
      border: "border-emerald-200",
      icon: "ti-check",
      iconColor: "text-emerald-600",
    },
    error: {
      border: "border-rose-200",
      icon: "ti-alert-triangle",
      iconColor: "text-rose-600",
    },
  };
  const s = styles[toast.kind];

  return (
    <button
      type="button"
      onClick={onDismiss}
      className={`pointer-events-auto flex items-start gap-2 rounded-md border ${s.border} bg-white px-3 py-2.5 text-left text-[12px] text-slate-800 shadow-sm hover:bg-slate-50`}
    >
      <span className={`ti ${s.icon} mt-0.5 text-[14px] ${s.iconColor}`} aria-hidden="true" />
      <span className="flex-1">{toast.message}</span>
    </button>
  );
}

/**
 * Hook pour push un toast. Fallback silencieux si le provider n'est pas
 * monté (ex : hors de la sous-arbre app) — plutôt que throw.
 */
export function useToast(): (message: string, kind?: ToastKind) => void {
  const c = useContext(ctx);
  return c?.push ?? (() => {});
}
