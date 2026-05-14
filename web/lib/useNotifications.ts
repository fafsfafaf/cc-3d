'use client';
import { useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'cc-3d-notifications-enabled';

export function useNotifications() {
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setPermission(Notification.permission);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'true' && Notification.permission === 'granted') {
      setEnabled(true);
    }
  }, []);

  const toggle = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (enabled) {
      setEnabled(false);
      localStorage.setItem(STORAGE_KEY, 'false');
      return;
    }
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm === 'granted') {
      setEnabled(true);
      localStorage.setItem(STORAGE_KEY, 'true');
    }
  }, [enabled]);

  const notify = useCallback(
    (title: string, body: string, onClick?: () => void) => {
      if (!enabled || typeof window === 'undefined' || !('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;
      try {
        const n = new Notification(title, { body, silent: true, tag: 'cc-3d' });
        if (onClick) n.onclick = () => { window.focus(); onClick(); n.close(); };
      } catch {
        /* ignore */
      }
    },
    [enabled],
  );

  return { enabled, permission, toggle, notify };
}
