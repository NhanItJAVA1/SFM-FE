import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";

import type { AuthUser } from "@/api/authApi";

import { getAuthRefreshToken, setAuthAccessToken, setAuthRefreshToken, setAuthUser } from "@/stores/authSession";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
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

if (!API_URL) {
  console.warn("Missing EXPO_PUBLIC_API_URL. Add it to your .env file.");
}

let accessToken: string | null = null;

let refreshAccessTokenPromise: Promise<boolean> | null = null;

let tokenRefreshHandler: TokenRefreshHandler | null = null;

export function setApiAccessToken(token: string | null) {
  accessToken = token;
}

export function setApiTokenRefreshHandler(handler: TokenRefreshHandler | null) {
  tokenRefreshHandler = handler;
}

/**
 * --------------------------------------------------------------------------
 * Axios instance
 * --------------------------------------------------------------------------
 */

const httpClient: AxiosInstance = axios.create({
  baseURL: API_URL?.replace(/\/$/, ""),
  headers: {
    Accept: "application/json",
  },
});

/**
 * --------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------------
 */

// function getAuthHeaders(): Record<string, string> {
//   return accessToken
//     ? {
//         Authorization: `Bearer ${accessToken}`,
//       }
//     : {};
// }

function getSafeHeaders(headers?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!headers) {
    return headers;
  }

  return {
    ...headers,
    ...(headers.Authorization
      ? {
          Authorization: "Bearer ***",
        }
      : {}),
  };
}

function getNoCacheHeaders(method?: RequestOptions["method"]): Record<string, string> {
  if ((method ?? "GET") !== "GET") {
    return {};
  }

  return {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
  };
}

// function extractErrorMessage(error: AxiosError): string {
//   const responseData = error.response?.data;

//   if (typeof responseData === "object" && responseData !== null && "message" in responseData) {
//     return String((responseData as { message?: unknown }).message);
//   }

//   if (typeof responseData === "string" && responseData) {
//     return responseData;
//   }

//   if (error.message) {
//     return error.message;
//   }

//   return `Request failed with status ${error.response?.status ?? "unknown"}`;
// }

/**
 * --------------------------------------------------------------------------
 * API logging
 * --------------------------------------------------------------------------
 *
 * Useful for debugging API calls from Expo / React Native.
 * Access token is intentionally hidden.
 */

function logRequest(config: InternalAxiosRequestConfig) {
  console.log("========== API REQUEST ==========");
  console.log("METHOD:", config.method?.toUpperCase());
  console.log("URL:", config.url);
  console.log("FULL URL:", `${config.baseURL ?? ""}${config.url ?? ""}`);
  console.log("HEADERS:", getSafeHeaders(config.headers as unknown as Record<string, unknown>));
  console.log("DATA:", config.data);
  console.log("=================================");
}

function logResponse(response: { status: number; config: InternalAxiosRequestConfig; data: unknown }) {
  console.log("========== API RESPONSE ==========");
  console.log("METHOD:", response.config.method?.toUpperCase());
  console.log("URL:", `${response.config.baseURL ?? ""}${response.config.url ?? ""}`);
  console.log("STATUS:", response.status);
  console.log("DATA:", response.data);
  console.log("==================================");
}

function logError(error: AxiosError) {
  console.error("=========== API ERROR ===========");
  console.error("METHOD:", error.config?.method?.toUpperCase());
  console.error("URL:", `${error.config?.baseURL ?? ""}${error.config?.url ?? ""}`);
  console.error("STATUS:", error.response?.status);
  console.error("DATA:", error.response?.data);
  console.error("MESSAGE:", error.message);
  console.error("=================================");
}

/**
 * --------------------------------------------------------------------------
 * Refresh token
 * --------------------------------------------------------------------------
 */

async function refreshAccessToken() {
  const refreshToken = getAuthRefreshToken();

  console.log("🔄 REFRESH TOKEN REQUEST");

  if (!refreshToken) {
    console.log("❌ No refresh token available");
    return false;
  }

  try {
    /*
     * IMPORTANT:
     *
     * Use a separate axios request here instead of httpClient.
     * This prevents the refresh request itself from entering
     * the normal authentication / retry flow.
     */
    const response = await axios.post<RefreshTokenResponse>(
      "/auth/refresh-token",
      {
        refreshToken,
      },
      {
        baseURL: API_URL?.replace(/\/$/, ""),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      },
    );

    console.log("🔄 REFRESH TOKEN RESPONSE:", response.status);

    const data = response.data;

    if (!data?.accessToken) {
      console.log("❌ Refresh response does not contain accessToken");

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

    console.log("✅ Access token refreshed successfully");

    return true;
  } catch (error) {
    console.error("❌ Refresh token failed:", error);

    return false;
  }
}

async function refreshAccessTokenOnce() {
  refreshAccessTokenPromise ??= refreshAccessToken().finally(() => {
    refreshAccessTokenPromise = null;
  });

  return refreshAccessTokenPromise;
}

/**
 * --------------------------------------------------------------------------
 * Axios interceptors
 * --------------------------------------------------------------------------
 */

/**
 * Request interceptor
 *
 * Automatically:
 * - Adds Authorization header
 * - Adds no-cache headers for GET
 * - Logs API request
 */
httpClient.interceptors.request.use(
  (config) => {
    config.headers = config.headers ?? {};

    const method = config.method?.toUpperCase() as RequestOptions["method"];

    /**
     * Don't overwrite Authorization if a specific request
     * explicitly supplied one.
     */
    if (accessToken && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    if (method === "GET") {
      config.headers["Cache-Control"] = "no-cache, no-store, must-revalidate";

      config.headers.Pragma = "no-cache";
    }

    logRequest(config);

    return config;
  },
  (error) => {
    console.error("❌ REQUEST INTERCEPTOR ERROR:", error);

    return Promise.reject(error);
  },
);

/**
 * Response interceptor
 *
 * Handles:
 * - API logging
 * - 401
 * - Refresh token
 * - Retry original request once
 */
httpClient.interceptors.response.use(
  (response) => {
    logResponse(response);

    return response;
  },

  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & {
          _retry?: boolean;
        })
      | undefined;

    /**
     * No original request -> just reject.
     */
    if (!originalRequest) {
      logError(error);

      return Promise.reject(error);
    }

    /**
     * Only handle 401 once.
     *
     * This prevents an infinite loop:
     *
     * 401 -> refresh -> 401 -> refresh -> ...
     */
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      console.log("🔐 Access token rejected. Trying refresh token flow.");

      const refreshed = await refreshAccessTokenOnce();

      if (refreshed) {
        console.log("🔁 Retrying original request with new access token");

        originalRequest.headers = originalRequest.headers ?? {};

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;

        return httpClient.request(originalRequest);
      }
    }

    logError(error);

    return Promise.reject(error);
  },
);

/**
 * --------------------------------------------------------------------------
 * Generic request
 * --------------------------------------------------------------------------
 */

async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const method = options.method ?? "GET";

  const response = await httpClient.request<T>({
    url: path,
    method,
    data: options.body,
    headers: {
      ...getNoCacheHeaders(method),
      ...options.headers,
    },
  });

  return {
    data: response.data,
    status: response.status,
  };
}

/**
 * --------------------------------------------------------------------------
 * Binary request
 * --------------------------------------------------------------------------
 */

async function requestBinary(path: string): Promise<BinaryApiResponse> {
  const response = await httpClient.get<ArrayBuffer>(path, {
    responseType: "arraybuffer",
    headers: {
      Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ...getNoCacheHeaders("GET"),
    },
  });

  return {
    data: response.data,
    headers: new Headers(response.headers as Record<string, string>),
    status: response.status,
  };
}

/**
 * --------------------------------------------------------------------------
 * FormData upload
 * --------------------------------------------------------------------------
 */

async function uploadFormData<T = unknown>(path: string, formData: FormData): Promise<ApiResponse<T>> {
  const response = await httpClient.post<T>(path, formData, {
    headers: {
      Accept: "application/json",
      /*
       * Don't manually set Content-Type:
       *
       * Axios / React Native will generate the correct
       * multipart boundary for FormData.
       */
    },
  });

  return {
    data: response.data,
    status: response.status,
  };
}

/**
 * --------------------------------------------------------------------------
 * Public API
 * --------------------------------------------------------------------------
 *
 * Keep the same interface as the old custom fetch wrapper.
 */

export const axiosClient = {
  get: <T = unknown>(path: string) => request<T>(path),

  getBinary: (path: string) => requestBinary(path),

  post: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body,
    }),

  put: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "PUT",
      body,
    }),

  delete: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "DELETE",
      body,
    }),

  uploadFormData,
};
