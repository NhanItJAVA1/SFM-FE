import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { ExportTransactionsParams, transactionsApi } from '@/api/transactionsApi';

const excelMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const excelUti = 'org.openxmlformats.spreadsheetml.sheet';

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  let index = 0;

  for (; index + 2 < bytes.length; index += 3) {
    output += characters[bytes[index] >> 2];
    output += characters[((bytes[index] & 3) << 4) | (bytes[index + 1] >> 4)];
    output += characters[((bytes[index + 1] & 15) << 2) | (bytes[index + 2] >> 6)];
    output += characters[bytes[index + 2] & 63];
  }

  if (index < bytes.length) {
    output += characters[bytes[index] >> 2];

    if (index + 1 < bytes.length) {
      output += characters[((bytes[index] & 3) << 4) | (bytes[index + 1] >> 4)];
      output += characters[(bytes[index + 1] & 15) << 2];
      output += '=';
    } else {
      output += characters[(bytes[index] & 3) << 4];
      output += '==';
    }
  }

  return output;
}

function getExportFilename(contentDisposition: string | null) {
  if (!contentDisposition) {
    return `transactions-${Date.now()}.xlsx`;
  }

  const encodedFilename = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];

  if (encodedFilename) {
    return decodeURIComponent(encodedFilename.trim().replace(/^"|"$/g, ''));
  }

  const filename = contentDisposition.match(/filename="?([^";]+)"?/i)?.[1];

  return filename?.trim() || `transactions-${Date.now()}.xlsx`;
}

function downloadExportOnWeb(data: ArrayBuffer, filename: string) {
  const blob = new Blob([data], { type: excelMimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function exportTransactionsFile(params: ExportTransactionsParams = {}) {
  const response = await transactionsApi.exportTransactions(params);
  const filename = getExportFilename(response.headers.get('content-disposition'));

  if (Platform.OS === 'web') {
    downloadExportOnWeb(response.data, filename);
    return { fileUri: null, filename, shared: false };
  }

  const directory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;

  if (!directory) {
    throw new Error('Không tìm thấy thư mục lưu file tạm.');
  }

  const fileUri = `${directory}${filename}`;

  await FileSystem.writeAsStringAsync(fileUri, arrayBufferToBase64(response.data), {
    encoding: FileSystem.EncodingType.Base64,
  });

  const canShare = await Sharing.isAvailableAsync();

  if (!canShare) {
    return { fileUri, filename, shared: false };
  }

  await Sharing.shareAsync(fileUri, {
    UTI: excelUti,
    dialogTitle: 'Xuất sổ giao dịch',
    mimeType: excelMimeType,
  });

  return { fileUri, filename, shared: true };
}
