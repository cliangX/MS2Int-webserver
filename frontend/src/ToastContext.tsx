import { createContext, useContext, type ReactNode } from "react";
import ToastContainer, { useToast, type ToastType } from "./components/PixelToast";

interface ToastContextValue {
  toast: (type: ToastType, text: string) => void;
}

const Ctx = createContext<ToastContextValue>({ toast: () => {} });

export function useAppToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { toasts, addToast, dismissToast } = useToast();
  return (
    <Ctx.Provider value={{ toast: addToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </Ctx.Provider>
  );
}
