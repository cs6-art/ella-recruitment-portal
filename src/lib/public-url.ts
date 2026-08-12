export function getPublicAppBaseUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.origin;
    } catch {
      // Fall through to the request host when configuration is malformed.
    }
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim() || request.headers.get("host")?.trim();
  if (forwardedHost) {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim() || "http";
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

export function bookingLink(baseUrl: string, kind: "voice" | "final", token: string) {
  return `${baseUrl.replace(/\/$/, "")}/book/${kind}/${encodeURIComponent(token)}`;
}
