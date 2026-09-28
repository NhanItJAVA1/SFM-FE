export type BankNotificationPayload = {
  packageName: string;
  title?: string | null;
  text?: string | null;
  bigText?: string | null;
  subText?: string | null;
  postedAt: number;
};

export type BankAppConfig = {
  bankCode: string;
  bankName: string;
  androidPackageName: string;
};
