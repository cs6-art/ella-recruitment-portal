/**
 * Running `next build` while `next dev` is up overwrites the shared `.next`
 * directory, which leaves the dev server serving HTML that points at build
 * asset hashes it cannot produce. Every stylesheet then 404s and the app
 * renders as unstyled HTML.
 *
 * Giving each mode its own output directory removes the collision, so a
 * production build can be verified without disturbing a running dev server.
 */
const distDir = process.env.NEXT_DIST_DIR
  || (process.env.NODE_ENV === "development" ? ".next-dev" : ".next");

/** @type {import("next").NextConfig} */
const nextConfig = {
  distDir,
  // PDF parsing uses a native canvas package for the DOM geometry primitives
  // that PDF.js needs in Node. Keep both packages external so Vercel loads the
  // supported Node modules (and the correct native binary) at runtime.
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse"],
};

export default nextConfig;
