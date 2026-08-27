import type { NextConfig } from "next";

/**
 * Deployed behind an nginx reverse proxy at https://<host>/compass.
 *
 * `basePath` is inlined into the client bundles at build time, so it cannot be
 * changed without rebuilding — and it applies to `next dev` too, meaning the
 * local dev server also serves from /compass.
 */
const BASE_PATH = "/compass";

const nextConfig: NextConfig = {
  basePath: BASE_PATH,

  // Emit .next/standalone so the runtime image ships without node_modules.
  output: "standalone",

  // trailingSlash is deliberately left unset (false). Enabling it makes nginx
  // and Next disagree about redirects on a sub-path mount.

  async rewrites() {
    // Server-side only: the browser never sees this host. Requests arrive at
    // /compass/api/* (the source below is automatically prefixed with
    // basePath) and are forwarded to FastAPI with the /api segment stripped,
    // which keeps browser traffic same-origin and avoids CORS entirely.
    //
    // BUILD TIME, NOT RUNTIME. next.config is evaluated during `next build` and
    // the resolved destination is frozen into routes-manifest.json, so setting
    // BACKEND_API_URL on the running container has no effect — it must be
    // supplied as a build argument. The localhost default below is for `next
    // dev` only; a container built without BACKEND_API_URL will bake in
    // 127.0.0.1 and every API call will fail with ECONNREFUSED.
    const backendUrl = process.env.BACKEND_API_URL ?? "http://127.0.0.1:8001";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
