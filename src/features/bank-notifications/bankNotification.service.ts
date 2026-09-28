import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import { findBankByPackage } from './bankNotification.registry';
import type { BankAppConfig, BankNotificationPayload } from './bankNotification.types';

type BankNotificationListener = (
  notification: BankNotificationPayload,
  bank: BankAppConfig | null,
) => void;

type BankNotificationNativeModule = {
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
  isNotificationAccessEnabled: () => Promise<boolean>;
  openNotificationAccessSettings: () => Promise<void>;
};

const EVENT_NAME = 'onBankNotification';
const nativeModule = NativeModules.BankNotificationModule as BankNotificationNativeModule | undefined;
const emitter = nativeModule ? new NativeEventEmitter(nativeModule) : null;

function isAndroidNativeModuleAvailable() {
  return Platform.OS === 'android' && Boolean(nativeModule);
}

export function addBankNotificationListener(listener: BankNotificationListener) {
  if (!isAndroidNativeModuleAvailable() || !emitter) {
    return { remove: () => undefined };
  }

  return emitter.addListener(EVENT_NAME, (notification: BankNotificationPayload) => {
    const bank = findBankByPackage(notification.packageName);

    if (__DEV__) {
      console.log('[BankNotification]', {
        ...notification,
        bank,
      });
    }

    listener(notification, bank);
  });
}

export async function openNotificationAccessSettings() {
  if (!isAndroidNativeModuleAvailable()) {
    return;
  }

  await nativeModule?.openNotificationAccessSettings();
}

export async function isNotificationAccessEnabled() {
  if (!isAndroidNativeModuleAvailable()) {
    return false;
  }

  return nativeModule?.isNotificationAccessEnabled() ?? false;
}

export function subscribeBankNotificationDevLogger() {
  if (!__DEV__) {
    return { remove: () => undefined };
  }

  return addBankNotificationListener(() => undefined);
}
