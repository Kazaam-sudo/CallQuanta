const DEFAULT_INTERNAL_API_BASE_URL = "http://api:8000";
const LOCAL_INTERNAL_API_BASE_URL = "http://localhost:8000";

type FetchInitWithDuplex = RequestInit & { duplex: "half" };

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
  const contentLength = request.headers.get("content-length");

  if (contentType) headers.set("content-type", contentType);
  if (contentLength) headers.set("content-length", contentLength);

  return headers;
}

export async function proxyUploadRequest(request: Request, upstreamPath: string) {
  const upstreamUrl = `${getInternalApiBaseUrl()}${upstreamPath}`;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: buildProxyHeaders(request),
      body: request.body,
      duplex: "half",
    } as FetchInitWithDuplex);

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    console.error(`Upload proxy failed to reach API backend at ${upstreamUrl}`, error);

    return Response.json(
      { detail: "Upload proxy failed to reach API backend" },
      { status: 502 },
    );
  }
}
