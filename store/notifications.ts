import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { Notification } from '@/types';

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
  setNotifications: (notifications: Notification[]) => void;
  markAsRead: (id: string) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationStore>()(
  devtools((set) => ({
    notifications: [],
    unreadCount: 0,
    addNotification: (notification) =>
      set((state) => ({
        notifications: [notification, ...state.notifications],
        unreadCount: !notification.read ? state.unreadCount + 1 : state.unreadCount,
      })),
    removeNotification: (id) =>
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id),
      })),
    setNotifications: (notifications) =>
      set({
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
      }),
    markAsRead: (id) =>
      set((state) => {
        const notification = state.notifications.find((n) => n.id === id);
        return {
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
          unreadCount: notification && !notification.read ? state.unreadCount - 1 : state.unreadCount,
        };
      }),
    clearAll: () =>
      set({
        notifications: [],
        unreadCount: 0,
      }),
  }))
);
