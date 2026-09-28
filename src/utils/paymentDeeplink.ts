import { Alert, Linking } from "react-native";

type VietQRPaymentParams = {
  appCode: string;
  bankCode: string;
  accountNumber: string;
  amount: number | string;
  content: string;
  returnUrl?: string;
};

const VIETQR_PAY_URL = "https://dl.vietqr.io/pay";

export function buildVietQRPaymentUrl({
  accountNumber,
  amount,
  appCode,
  bankCode,
  content,
  returnUrl,
}: VietQRPaymentParams) {
  const params = new URLSearchParams({
    app: appCode,
    ba: `${accountNumber}@${bankCode}`,
    am: String(amount),
    tn: content,
  });

  const optionalParams: [string, string | undefined][] = [
    ["url", returnUrl],
  ];

  optionalParams.forEach(([key, value]) => {
    if (value) {
      params.append(key, value);
    }
  });

  return `${VIETQR_PAY_URL}?${params.toString()}`;
}

export async function openVietQRPayment({
  accountNumber,
  amount,
  appCode,
  bankCode,
  content,
  returnUrl,
}: VietQRPaymentParams) {
  const url = buildVietQRPaymentUrl({
    accountNumber,
    amount,
    appCode,
    bankCode,
    content,
    returnUrl,
  });

  console.log("VietQR Payment URL:", url);

  try {
    const canOpen = await Linking.canOpenURL(url);

    if (!canOpen) {
      Alert.alert("Không mở được ứng dụng ngân hàng", "Thiết bị không hỗ trợ mở deeplink thanh toán VietQR.");
      return { opened: false, url };
    }

    await Linking.openURL(url);
    return { opened: true, url };
  } catch (error) {
    Alert.alert(
      "Không mở được ứng dụng ngân hàng",
      error instanceof Error ? error.message : "Vui lòng kiểm tra ứng dụng ngân hàng đã được cài đặt trên thiết bị.",
    );
    return { opened: false, url };
  }
}
