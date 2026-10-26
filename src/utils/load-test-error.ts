export type LoadTestErrorDetails = {
  title: string;
  explanation: string;
  suggestion: string;
  statusCode: number | null;
  errorCode: string | null;
  backendMessage: string | null;
  requestPath: string | null;
  timestamp: string | null;
  detailsUnavailable: boolean;
  timeout: boolean;
};

type ErrorEnvelope = {
  response?: { status?: unknown; data?: unknown };
  config?: { url?: unknown };
  code?: unknown;
  message?: unknown;
};

function safeText(value: unknown, maxLength = 1000): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED JWT]')
    .replace(/(?:cookie|set-cookie)\s*[:=]\s*[^\r\n]*/gi, 'Cookie: [REDACTED]')
    .replace(/\b(?:https?|rediss?):\/\/[^\s"'<>]+/gi, '[REDACTED URL]')
    .replace(/((?:authorization|access[_-]?token|refresh[_-]?token|token|runner[_-]?(?:service[_-]?)?token|password|secret|api[_-]?key|connectionstring|database[_-]?url|redis[_-]?url|prometheus[_-]?url|EXPO_PUBLIC_[A-Z0-9_]+)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .split(/\r?\n/)
    .filter(line => !/^\s*(at\s|---\s*end of|stack\s*trace|inner exception)/i.test(line))
    .join('\n')
    .trim()
    .slice(0, maxLength) || null;
}

function safePath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  let path = value.trim();
  try {
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
  } catch {
    return null;
  }
  path = path.split(/[?#]/, 1)[0].replace(/[\r\n]/g, '');
  return path.startsWith('/') ? path.slice(0, 200) : null;
}

function validTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function explanation(status: number | null, message: string | null) {
  const runnerDetailsUnavailable = !message || /load test runner rejected the request/i.test(message);
  switch (status) {
    case 400: return { title: 'Cấu hình kiểm thử không hợp lệ', explanation: 'Backend từ chối cấu hình kiểm thử.', suggestion: 'Kiểm tra Scenario, Target, VUs và Duration trước khi thử lại.' };
    case 401: return { title: 'Phiên đăng nhập cần được xác thực lại', explanation: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', suggestion: 'Đăng nhập lại theo luồng xác thực hiện có rồi thử lại.' };
    case 403: return { title: 'Không đủ quyền truy cập', explanation: 'Bạn không có quyền thực hiện kiểm thử tải.', suggestion: 'Đăng nhập bằng tài khoản Admin được cấp quyền.' };
    case 404: return { title: 'Không tìm thấy tài nguyên', explanation: 'Không tìm thấy API kiểm thử hoặc tài nguyên được yêu cầu.', suggestion: 'Kiểm tra phiên bản Backend và trạng thái dịch vụ.' };
    case 409: return {
      title: 'Yêu cầu xung đột',
      explanation: 'Backend trả về HTTP 409. Có thể đang tồn tại một bài kiểm thử khác.',
      suggestion: 'Tải lại trạng thái Runner để xác nhận bài kiểm thử hiện tại trước khi thử lại.',
      ...(runnerDetailsUnavailable ? { note: 'Backend chưa cung cấp chi tiết đủ để xác nhận nguyên nhân hoặc trạng thái của Runner.' } : {}),
    };
    case 429: return { title: 'Đã gửi quá nhiều yêu cầu', explanation: 'Có quá nhiều yêu cầu trong thời gian ngắn.', suggestion: 'Chờ một lúc rồi thử lại.' };
    case 500: return { title: 'Backend gặp lỗi', explanation: 'Backend gặp lỗi khi xử lý yêu cầu.', suggestion: 'Thử lại sau; nếu lỗi tiếp diễn, kiểm tra log Backend.' };
    case 502:
    case 503:
    case 504: return {
      title: 'Dịch vụ kiểm thử tải không khả dụng',
      explanation: `Backend trả về HTTP ${status}; dịch vụ kiểm thử tải có thể không khả dụng hoặc phản hồi bất thường.`,
      suggestion: 'Kiểm tra Runner service và Docker logs.',
      ...(runnerDetailsUnavailable ? { note: 'Đây là mã HTTP do Backend trả về; chưa có thông tin xác nhận mã trạng thái riêng của Runner.' } : {}),
    };
    default: return {
      title: status ? 'Yêu cầu kiểm thử tải thất bại' : 'Không nhận được phản hồi từ dịch vụ',
      explanation: status ? `Backend trả về HTTP ${status}.` : 'Không nhận được phản hồi HTTP từ API kiểm thử tải.',
      suggestion: status ? 'Kiểm tra chi tiết kỹ thuật hoặc thử lại sau.' : 'Kiểm tra kết nối mạng và địa chỉ API Backend.',
      ...(runnerDetailsUnavailable ? { note: 'Backend chưa cung cấp thêm thông tin chi tiết về nguyên nhân.' } : {}),
    };
  }
}

export function parseLoadTestError(error: unknown): LoadTestErrorDetails {
  const source = (error && typeof error === 'object' ? error : {}) as ErrorEnvelope;
  const responseData = source.response?.data;
  const body = responseData && typeof responseData === 'object' ? responseData as Record<string, unknown> : {};
  const responseStatus = typeof source.response?.status === 'number' ? source.response.status : null;
  const bodyStatus = typeof body.statusCode === 'number' ? body.statusCode : null;
  const statusCode = responseStatus ?? bodyStatus;
  const errorCode = safeText(body.errorCode, 120);
  const rawMessage = typeof body.message === 'string' ? body.message
    : typeof body.detail === 'string' ? body.detail
      : typeof responseData === 'string' ? responseData : null;
  const backendMessage = safeText(rawMessage);
  const requestPath = safePath(body.path) ?? safePath(source.config?.url);
  const timestamp = validTimestamp(body.timestamp);
  const code = typeof source.code === 'string' ? source.code : '';
  const lowerMessage = typeof source.message === 'string' ? source.message.toLowerCase() : '';
  const timeout = code === 'ECONNABORTED' || code === 'ETIMEDOUT' || lowerMessage.includes('timeout');
  const genericRunnerMessage = Boolean(backendMessage && /load test runner rejected the request/i.test(backendMessage));

  if (timeout) {
    return {
      title: 'Yêu cầu hết thời gian chờ',
      explanation: 'API không phản hồi trong thời gian cho phép.',
      suggestion: 'Kiểm tra Backend và Runner, sau đó tải lại trạng thái trước khi thử lại.',
      statusCode, errorCode, backendMessage, requestPath, timestamp,
      detailsUnavailable: !backendMessage && !errorCode, timeout: true,
    };
  }

  if (!source.response && (code === 'ERR_NETWORK' || lowerMessage.includes('network'))) {
    return {
      title: 'Không thể kết nối đến API',
      explanation: 'Không nhận được phản hồi từ Backend do sự cố kết nối mạng.',
      suggestion: 'Kiểm tra kết nối, EXPO_PUBLIC_API_URL và khả năng truy cập Backend.',
      statusCode: null, errorCode: null, backendMessage: null, requestPath: safePath(source.config?.url), timestamp: null,
      detailsUnavailable: true, timeout: false,
    };
  }

  const mapped = explanation(statusCode, backendMessage) as ReturnType<typeof explanation> & { note?: string };
  return {
    title: mapped.title,
    explanation: mapped.note ? `${mapped.explanation} ${mapped.note}` : !backendMessage || genericRunnerMessage
      ? `${mapped.explanation} Backend chưa cung cấp thêm chi tiết về nguyên nhân.` : mapped.explanation,
    suggestion: mapped.suggestion,
    statusCode,
    errorCode,
    backendMessage,
    requestPath,
    timestamp,
    detailsUnavailable: genericRunnerMessage || !backendMessage,
    timeout: false,
  };
}

export function createAdminAccessError(): LoadTestErrorDetails {
  return {
    title: 'Không đủ quyền truy cập',
    explanation: 'Phiên đăng nhập không hợp lệ hoặc không có quyền Admin.',
    suggestion: 'Đăng nhập lại bằng tài khoản Admin theo luồng xác thực hiện có.',
    statusCode: null,
    errorCode: null,
    backendMessage: null,
    requestPath: null,
    timestamp: null,
    detailsUnavailable: true,
    timeout: false,
  };
}

export function formatLoadTestErrorDetails(error: LoadTestErrorDetails): string {
  return [
    'SFM Admin Load Testing error',
    `HTTP status: ${error.statusCode ?? 'Unavailable'}`,
    `Error code: ${error.errorCode ?? 'Unavailable'}`,
    `Backend message: ${error.backendMessage ?? 'Backend did not provide a detailed message.'}`,
    `Request path: ${error.requestPath ?? 'Unavailable'}`,
    `Timestamp: ${error.timestamp ?? 'Unavailable'}`,
    error.detailsUnavailable ? 'Detailed backend/Runner information was unavailable.' : null,
  ].filter(Boolean).join('\n');
}
