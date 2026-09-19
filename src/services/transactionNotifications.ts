import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { CreateTransactionFromScanResponse, TransactionNotification } from '@/api/transactionsApi';

const defaultNotificationTitle = 'Cảnh báo ngân sách';
const defaultNotificationBody = 'Một ngân sách vừa đạt ngưỡng cảnh báo.';

export async function presentTransactionNotifications(response: CreateTransactionFromScanResponse | null | undefined) {
  const notifications = getTransactionNotifications(response);

  if (notifications.length === 0 || isExpoGoAndroid()) {
    return;
  }

  const Notifications = await loadNotifications();

  if (!Notifications || !(await ensureNotificationPermission(Notifications))) {
    return;
  }

  await Promise.all(notifications.map((notification) => scheduleTransactionNotification(Notifications, notification)));
}

function getTransactionNotifications(response: CreateTransactionFromScanResponse | null | undefined) {
  if (!response) {
    return [];
  }

  if (Array.isArray(response.notifications)) {
    return response.notifications.filter(Boolean);
  }

  return response.notification ? [response.notification] : [];
}

async function loadNotifications() {
  try {
    const Notifications = await import('expo-notifications');

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    return Notifications;
  } catch {
    return null;
  }
}

function isExpoGoAndroid() {
  return Platform.OS === 'android' && Constants.appOwnership === 'expo';
}

async function ensureNotificationPermission(Notifications: NonNullable<Awaited<ReturnType<typeof loadNotifications>>>) {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('budget-alerts', {
      importance: Notifications.AndroidImportance.HIGH,
      name: 'Cảnh báo ngân sách',
    });
  }

  const currentPermission = await Notifications.getPermissionsAsync();
  let finalStatus = currentPermission.status;

  if (finalStatus !== 'granted') {
    const requestedPermission = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermission.status;
  }

  return finalStatus === 'granted';
}

function scheduleTransactionNotification(
  Notifications: NonNullable<Awaited<ReturnType<typeof loadNotifications>>>,
  notification: TransactionNotification,
) {
  const title = notification.title?.trim() || getTitleByLevel(notification.level);
  const body = notification.body?.trim() || notification.message?.trim() || defaultNotificationBody;

  return Notifications.scheduleNotificationAsync({
    content: {
      body,
      data: {
        budgetId: notification.budgetId,
        level: notification.level,
        type: notification.type ?? 'BudgetAlert',
      },
      title,
    },
    trigger: null,
  });
}

function getTitleByLevel(level: TransactionNotification['level']) {
  if (level === 'Critical') {
    return 'Ngân sách đã vượt ngưỡng';
  }

  if (level === 'Warning') {
    return 'Ngân sách sắp vượt ngưỡng';
  }

  return defaultNotificationTitle;
}
