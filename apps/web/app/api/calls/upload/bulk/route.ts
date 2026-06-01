import { proxyUploadRequest } from "../uploadProxy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return proxyUploadRequest(request, "/calls/upload/bulk");
}
