export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";

export function fetchWithCredentials(input: Parameters<typeof fetch>[0], init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    credentials: init.credentials || "include",
  });
}

export async function authenticatedFetch(input: Parameters<typeof fetch>[0], init: RequestInit = {}) {
  const response = await fetchWithCredentials(input, init);
  if (response.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new Event("callquanta-unauthorized"));
  }
  return response;
}
