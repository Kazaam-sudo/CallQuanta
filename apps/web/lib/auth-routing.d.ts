export const PUBLIC_PATHS: Set<string>;
export function isPublicPath(pathname?: string): boolean;
export function safeNextPath(value: string | null | undefined): string;
export function loginUrlFor(pathname?: string): string;
