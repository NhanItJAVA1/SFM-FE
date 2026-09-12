type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
};

export type ApiResponse<T = unknown> = {
  data: T;
  status: number;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL;
let accessToken: string | null = null;

export function setApiAccessToken(token: string | null) {
  accessToken = token;
}

function buildUrl(path: string) {
  if (!API_URL) {
    throw new Error('Missing EXPO_PUBLIC_API_URL. Add it to your .env file.');
  }

  const baseUrl = API_URL.replace(/\/$/, '');
  const endpoint = path.startsWith('/') ? path : `/${path}`;

  return `${baseUrl}${endpoint}`;
}

async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const response = await fetch(buildUrl(path), {
    method: options.method ?? 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

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

export const axiosClient = {
  get: <T = unknown>(path: string) => request<T>(path),
  post: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body,
    }),
};
