// The static candidate-facing apply page (see G:\My Drive\Downloads\index.html)
// is hosted on its own domain, separate from this portal. Only that origin is
// allowed to call the public, unauthenticated endpoints it depends on.
function allowedOrigins() {
  return [
    "https://ellai.mclinkgroup.com",
    process.env.RESUME_SCREENING_INVITE_BASE_URL,
    process.env.N8N_BULK_RESUME_PORTAL_BASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    ...(process.env.PUBLIC_APPLICATION_ORIGINS || "").split(","),
  ]
    .map((value) => {
      const cleanValue = value?.trim();
      if (!cleanValue) return "";
      try {
        // The invite setting may contain the full candidate page path, such
        // as /index.html. CORS compares origins, so keep only
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
  // The downloadable standalone application form is also opened directly
  // from a local file during HR testing, which browsers identify as the
  // opaque `null` origin. The endpoint is public and rate-limited, so allow
  // that origin without exposing authenticated portal responses.
  if (origin === "null" || (origin && allowedOrigins().includes(origin))) {
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
