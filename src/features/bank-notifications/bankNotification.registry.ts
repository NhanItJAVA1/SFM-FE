import type { BankAppConfig } from './bankNotification.types';

export const BANK_APPS: BankAppConfig[] = [
  // Add verified Android package names after capturing real bank notifications on a test device.
];

export function findBankByPackage(packageName: string) {
  return BANK_APPS.find((bankApp) => bankApp.androidPackageName === packageName) ?? null;
}
