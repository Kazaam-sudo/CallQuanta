const DEFAULT_INTERNAL_API_BASE_URL = "http://api:8000";
const LOCAL_INTERNAL_API_BASE_URL = "http://localhost:8000";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getInternalApiBaseUrl() {
  const configured = process.env.API_INTERNAL_BASE_URL || process.env.INTERNAL_API_URL;
  if (configured) return trimTrailingSlash(configured);
  if (process.env.NODE_ENV === "development") return LOCAL_INTERNAL_API_BASE_URL;
  return DEFAULT_INTERNAL_API_BASE_URL;
}

function buildProxyHeaders(request: Request) {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const cookie = request.headers.get("cookie");
  if (contentType) headers.set("content-type", contentType);
  if (cookie) headers.set("cookie", cookie);
  return headers;
}

type FetchInitWithDuplex = RequestInit & { duplex?: "half" };

async function proxyAuthRequest(request: Request, segments: string[]) {
  const upstreamPath = `/auth/${segments.join("/")}`;
  const upstreamUrl = `${getInternalApiBaseUrl()}${upstreamPath}`;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers: buildProxyHeaders(request),
    body: hasBody ? request.body : undefined,
    redirect: "manual",
    duplex: hasBody ? "half" : undefined,
  } as FetchInitWithDuplex);

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  const setCookie = upstream.headers.get("set-cookie");
  if (contentType) responseHeaders.set("content-type", contentType);
  if (setCookie) responseHeaders.set("set-cookie", setCookie);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request: Request, { params }: { params: { path: string[] } }) {
  return proxyAuthRequest(request, params.path);
}

export async function POST(request: Request, { params }: { params: { path: string[] } }) {
  return proxyAuthRequest(request, params.path);
}
