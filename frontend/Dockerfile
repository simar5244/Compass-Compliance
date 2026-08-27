# syntax=docker/dockerfile:1

# ---- deps: install node_modules once, cached on lockfile changes ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: produce .next/standalone ----
FROM node:20-alpine AS builder
WORKDIR /app

# Deliberately no default. NEXT_PUBLIC_* values are inlined into the client
# bundle at build time, so a default here would silently ship a wrong API URL
# instead of failing. The check below turns that into a loud build failure.
ARG NEXT_PUBLIC_API_URL
ARG BASE_PATH=/compass

# Also build-time: next.config's rewrite destination is frozen into
# routes-manifest.json during `next build`, so this cannot be set at run time.
ARG BACKEND_API_URL

RUN test -n "$NEXT_PUBLIC_API_URL" || ( \
      echo "ERROR: build arg NEXT_PUBLIC_API_URL is required." >&2; \
      echo "  Same-origin behind nginx:  --build-arg NEXT_PUBLIC_API_URL=${BASE_PATH}/api" >&2; \
      echo "  Separate API origin:       --build-arg NEXT_PUBLIC_API_URL=https://api.example.com" >&2; \
      exit 1 )

RUN test -n "$BACKEND_API_URL" || ( \
      echo "ERROR: build arg BACKEND_API_URL is required." >&2; \
      echo "  It is baked into the build, not read at run time." >&2; \
      echo "  Compose service:  --build-arg BACKEND_API_URL=http://backend:8001" >&2; \
      echo "  Backend on host:  --build-arg BACKEND_API_URL=http://host.docker.internal:8001" >&2; \
      exit 1 )

# Promote to ENV so `next build` sees them.
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV BACKEND_API_URL=$BACKEND_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runner: minimal standalone server ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Bind to all interfaces so the container is reachable from nginx.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# standalone omits public/ and .next/static by design; copy them in so the
# bundled server.js can serve them.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
