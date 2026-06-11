import { useEffect, useState } from 'react';
import { getUserNotifications } from '@/services/notification.service';
import { Notification } from '@/types';

export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) return;

    setLoading(true);
    getUserNotifications(userId).then((notifs) => {
      setNotifications(notifs);
      setUnreadCount(notifs.filter((n) => !n.read).length);
      setLoading(false);
    });
  }, [userId]);

  return {
    notifications,
    loading,
    unreadCount,
    refetch: async () => {
      if (userId) {
        const notifs = await getUserNotifications(userId);
        setNotifications(notifs);
        setUnreadCount(notifs.filter((n) => !n.read).length);
      }
    },
  };
}
