/** Best-effort client IP from the proxy headers. Used only as a rate-limit key. */
export function clientIp(request: { headers: Headers }): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}
