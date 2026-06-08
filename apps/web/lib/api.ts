export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export function fetchWithCredentials(input: Parameters<typeof fetch>[0], init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    credentials: init.credentials || "include",
  });
}
