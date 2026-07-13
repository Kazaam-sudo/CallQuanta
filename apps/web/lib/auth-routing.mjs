export const PUBLIC_PATHS = new Set(["/", "/login"]);

export function isPublicPath(pathname = "/") {
  return PUBLIC_PATHS.has(pathname);
}

export function safeNextPath(value) {
  if (!value || typeof value !== "string") return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  if (value === "/login") return "/dashboard";
  return value;
}

export function loginUrlFor(pathname = "/dashboard") {
  return `/login?next=${encodeURIComponent(safeNextPath(pathname))}`;
}
