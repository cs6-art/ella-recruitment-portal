// The static candidate-facing apply page (see G:\My Drive\Downloads\index.html)
// is hosted on its own domain, separate from this portal. Only that origin is
// allowed to call the public, unauthenticated endpoints it depends on.
function allowedOrigins() {
  return [
    process.env.RESUME_SCREENING_INVITE_BASE_URL,
    process.env.N8N_BULK_RESUME_PORTAL_BASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]
    .map((value) => {
      const cleanValue = value?.trim();
      if (!cleanValue) return "";
      try {
        // The invite setting may contain the full candidate page path, such
        // as /application/index.html. CORS compares origins, so keep only
        // scheme + host + port here.
        return new URL(cleanValue).origin;
      } catch {
        return cleanValue.replace(/\/$/, "");
      }
    })
    .filter((value): value is string => Boolean(value));
}

export function publicCorsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  const headers = new Headers();
  if (origin && allowedOrigins().includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Accept");
  return headers;
}

export function publicCorsOptionsResponse(request: Request) {
  return new Response(null, { status: 204, headers: publicCorsHeaders(request) });
}

export function withPublicCors(request: Request, response: Response) {
  publicCorsHeaders(request).forEach((value, key) => response.headers.set(key, value));
  return response;
}
