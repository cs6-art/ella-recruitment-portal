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
};

export default nextConfig;
