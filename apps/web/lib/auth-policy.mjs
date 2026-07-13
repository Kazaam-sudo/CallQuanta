export function authStatusFromResponse(httpStatus, hasUser) {
  if (httpStatus === 401) return "unauthenticated";
  if (httpStatus >= 200 && httpStatus < 300 && hasUser) return "authenticated";
  if (httpStatus >= 200 && httpStatus < 300) return "unauthenticated";
  return "error";
}

export function shouldLoadProtectedSettings(status) {
  return status === "authenticated";
}

export function canRenderProtectedRoute(status) {
  return status === "authenticated";
}

export function loginFormIsAvailable(status) {
  return status !== "authenticated";
}
