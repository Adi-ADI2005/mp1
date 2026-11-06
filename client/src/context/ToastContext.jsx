import { createContext, useCallback, useContext, useState } from 'react';
import { Check, Info, TriangleAlert, X, CircleX } from 'lucide-react';

const ToastContext = createContext(null);
const icons = { success: Check, info: Info, warning: TriangleAlert, error: CircleX };
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const dismiss = useCallback((id) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const notify = useCallback((message, type = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setItems((current) => [...current, { id, message, type }]);
    window.setTimeout(() => dismiss(id), 4600);
  }, [dismiss]);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map(({ id, message, type }) => {
          const Icon = icons[type] || Info;
          return <div className={`toast-note ${type}`} key={id}><Icon size={16} /><div className="toast-copy">{message}</div><button className="toast-close" aria-label="Dismiss notification" onClick={() => dismiss(id)}><X size={15} /></button></div>;
        })}
      </div>
    </ToastContext.Provider>
  );
}
export function useToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error('useToast must be used inside ToastProvider');
  return notify;
}