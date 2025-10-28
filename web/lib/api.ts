const baseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || 'http://localhost:3001';

type FetchOptions = RequestInit & { body?: BodyInit | null };

export async function apiFetch<T = unknown>(path: string, options: FetchOptions = {}) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Request failed with status ${res.status}`);
  }
  return (await res.json()) as T;
}

export function getApiBaseUrl() {
  return baseUrl;
}
