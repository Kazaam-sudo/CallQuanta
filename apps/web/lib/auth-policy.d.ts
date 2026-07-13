import type { AuthStatus } from "../components/AuthProvider";

export function authStatusFromResponse(httpStatus: number, hasUser: boolean): AuthStatus;
export function shouldLoadProtectedSettings(status: AuthStatus): boolean;
export function canRenderProtectedRoute(status: AuthStatus): boolean;
export function loginFormIsAvailable(status: AuthStatus): boolean;
export function shouldRedirectLogin(status: AuthStatus, hasValidatedUser: boolean): boolean;
