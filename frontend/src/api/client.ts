// Thin fetch wrapper: no React, no react-native imports — plain
// TypeScript, so this file (and everything under src/api/) could be
// lifted into any other JS project unchanged.

const BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let authToken: string | null = null;

// AuthContext calls this whenever the token changes (after login,
// logout, or loading a saved token on app start), so every request
// after that automatically carries it — callers never pass it manually.
export function setAuthToken(token: string | null) {
  authToken = token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  } catch {
    // fetch() itself throws when the server can't be reached at all
    // (wrong host/IP, server down, phone not on the same network) —
    // that's a different failure than the server responding with an
    // error status, so it gets its own clear message instead of falling
    // through to a generic "something failed" in every screen.
    throw new ApiError(
      0,
      `לא ניתן להתחבר לשרת בכתובת ${BASE_URL}. ודא שהשרת פועל ושהמכשיר מחובר לאותה רשת.`
    );
  }

  if (!response.ok) {
    // FastAPI's default error shape is {"detail": "..."}.
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.detail ?? `Request failed (${response.status})`);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
