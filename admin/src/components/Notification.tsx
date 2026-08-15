"use client";

import { useState, useEffect, createContext, useContext, useCallback, ReactNode } from "react";

interface NotificationItem {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

interface NotificationContextType {
  notify: (type: NotificationItem["type"], message: string) => void;
}

const NotificationContext = createContext<NotificationContextType>({ notify: () => {} });

export function useNotification() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const notify = useCallback((type: NotificationItem["type"], message: string) => {
    const id = Date.now().toString();
    setNotifications((prev) => [...prev, { id, type, message }]);
  }, []);

  const remove = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {notifications.map((n) => (
          <NotificationToast key={n.id} item={n} onClose={() => remove(n.id)} />
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

function NotificationToast({ item, onClose }: { item: NotificationItem; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    success: "bg-emerald-50 border-emerald-500 text-emerald-800",
    error: "bg-red-50 border-red-500 text-red-800",
    info: "bg-blue-50 border-blue-500 text-blue-800",
  };

  return (
    <div className={`flex items-center gap-2 rounded-lg border-l-4 px-4 py-3 shadow-lg ${colors[item.type]}`}>
      <span className="text-sm font-medium">{item.message}</span>
      <button onClick={onClose} className="ml-2 text-current opacity-60 hover:opacity-100">&times;</button>
    </div>
  );
}
