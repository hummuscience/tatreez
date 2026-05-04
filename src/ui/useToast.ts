import { useCallback, useState } from 'react';

export interface ToastState {
  message: string;
  id: number;
}

export function useToast(): {
  toast: ToastState | null;
  showToast: (message: string) => void;
} {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string) => {
    const id = Date.now();
    setToast({ message, id });
    setTimeout(() => {
      setToast((cur) => (cur && cur.id === id ? null : cur));
    }, 2400);
  }, []);

  return { toast, showToast };
}
