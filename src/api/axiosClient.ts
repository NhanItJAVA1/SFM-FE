import type { AuthUser } from '@/api/authApi';
import {
  getAuthRefreshToken,
  setAuthAccessToken,
  setAuthRefreshToken,
  setAuthUser,
} from '@/stores/authSession';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
};

export type ApiResponse<T = unknown> = {
  data: T;
  status: number;
};

export type BinaryApiResponse = {
  data: ArrayBuffer;
  headers: Headers;
  status: number;
};

type RefreshTokenResponse = {
  accessToken: string;
  refreshToken?: string | null;
  user: AuthUser;
};

type TokenRefreshHandler = (response: RefreshTokenResponse) => void | Promise<void>;

const API_URL = process.env.EXPO_PUBLIC_API_URL;
let accessToken: string | null = null;
let refreshAccessTokenPromise: Promise<boolean> | null = null;
let tokenRefreshHandler: TokenRefreshHandler | null = null;

export function setApiAccessToken(token: string | null) {
  accessToken = token;
}

export function setApiTokenRefreshHandler(handler: TokenRefreshHandler | null) {
  tokenRefreshHandler = handler;
}

function buildUrl(path: string) {
  if (!API_URL) {
    throw new Error('Missing EXPO_PUBLIC_API_URL. Add it to your .env file.');
  }

  const baseUrl = API_URL.replace(/\/$/, '');
  const endpoint = path.startsWith('/') ? path : `/${path}`;

  return `${baseUrl}${endpoint}`;
}

function getAuthHeaders(): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

function getNoCacheHeaders(method: RequestOptions['method']): Record<string, string> {
  if ((method ?? 'GET') !== 'GET') {
    return {};
  }

  return {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
  };
}

async function parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? String(data.message)
        : `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return {
    data: data as T,
    status: response.status,
  };
}

async function parseBinaryResponse(response: Response): Promise<BinaryApiResponse> {
  if (!response.ok) {
    const text = await response.text();
    let message = `Request failed with status ${response.status}`;

    if (text) {
      try {
        const data = JSON.parse(text) as { message?: unknown };

        if (typeof data.message === 'string') {
          message = data.message;
        }
      } catch {
        message = text;
      }
    }

    throw new Error(message);
  }

  return {
    data: await response.arrayBuffer(),
    headers: response.headers,
    status: response.status,
  };
}

async function refreshAccessToken() {
  const refreshToken = getAuthRefreshToken();

  if (!refreshToken) {
    return false;
  }

  const response = await fetch(buildUrl('/auth/refresh-token'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    return false;
  }

  const text = await response.text();
  const data = text ? (JSON.parse(text) as RefreshTokenResponse) : null;

  if (!data?.accessToken) {
    return false;
  }

  const nextSession: RefreshTokenResponse = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken ?? refreshToken,
    user: data.user,
  };

  accessToken = nextSession.accessToken;
  setAuthAccessToken(nextSession.accessToken);
  setAuthRefreshToken(nextSession.refreshToken ?? null);
  setAuthUser(nextSession.user);

  if (tokenRefreshHandler) {
    await tokenRefreshHandler(nextSession);
  }

  return true;
}

async function refreshAccessTokenOnce() {
  refreshAccessTokenPromise ??= refreshAccessToken().finally(() => {
    refreshAccessTokenPromise = null;
  });

  return refreshAccessTokenPromise;
}

async function request<T = unknown>(
  path: string,
  options: RequestOptions = {},
  canRetryAuth = true,
): Promise<ApiResponse<T>> {
  const method = options.method ?? 'GET';
  const response = await fetch(buildUrl(path), {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...getNoCacheHeaders(method),
      ...getAuthHeaders(),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 401 && canRetryAuth && (await refreshAccessTokenOnce())) {
    return request<T>(path, options, false);
  }

  return parseResponse<T>(response);
}

async function requestBinary(path: string, canRetryAuth = true): Promise<BinaryApiResponse> {
  const response = await fetch(buildUrl(path), {
    method: 'GET',
    headers: {
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ...getNoCacheHeaders('GET'),
      ...getAuthHeaders(),
    },
  });

  if (response.status === 401 && canRetryAuth && (await refreshAccessTokenOnce())) {
    return requestBinary(path, false);
  }

  return parseBinaryResponse(response);
}

async function uploadFormData<T = unknown>(
  path: string,
  formData: FormData,
  canRetryAuth = true,
): Promise<ApiResponse<T>> {
  const response = await fetch(buildUrl(path), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...getAuthHeaders(),
    },
    body: formData,
  });

  if (response.status === 401 && canRetryAuth && (await refreshAccessTokenOnce())) {
    return uploadFormData<T>(path, formData, false);
  }

  return parseResponse<T>(response);
}

export const axiosClient = {
  get: <T = unknown>(path: string) => request<T>(path),
  getBinary: (path: string) => requestBinary(path),
  post: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body,
    }),
  put: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body,
    }),
  delete: <T = unknown>(path: string) =>
    request<T>(path, {
      method: 'DELETE',
    }),
  uploadFormData,
};
