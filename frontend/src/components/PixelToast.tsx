import { useEffect, useState } from "react";
import { X, AlertTriangle, CheckCircle, Info } from "lucide-react";

export type ToastType = "error" | "success" | "info";

export interface ToastMessage {
  id: number;
  type: ToastType;
  text: string;
}

const ICON_MAP = {
  error: AlertTriangle,
  success: CheckCircle,
  info: Info,
};

const BG_MAP = {
  error: "bg-destructive",
  success: "bg-success",
  info: "bg-primary",
};

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: (id: number) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 200);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const Icon = ICON_MAP[toast.type];

  return (
    <div
      className={`flex items-start gap-3 p-3 border-3 border-border-dark text-white ${BG_MAP[toast.type]}
        transition-all duration-200 ${visible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"}`}
      style={{ boxShadow: "4px 4px 0 0 var(--color-border-dark)", minWidth: 280, maxWidth: 400 }}
    >
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <p className="flex-1 text-[0.75rem] font-[family-name:var(--font-pixel-body)] leading-relaxed break-words">
        {toast.text}
      </p>
      <button onClick={() => { setVisible(false); setTimeout(() => onDismiss(toast.id), 200); }}
        className="flex-shrink-0 hover:opacity-70">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}

export default function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

// ── Hook ──────────────────────────────────────────────────────
let _nextId = 1;

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: ToastType, text: string) => {
    setToasts((prev) => [...prev, { id: _nextId++, type, text }]);
  };

  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return { toasts, addToast, dismissToast };
}
