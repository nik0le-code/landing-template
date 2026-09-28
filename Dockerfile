# syntax=docker/dockerfile:1

# --- build -------------------------------------------------------------------
FROM node:24-slim AS build
WORKDIR /app
ENV NODE_ENV=development

COPY package*.json ./
RUN npm ci --no-audit --fund=false

COPY . .
# SITE_URL is baked into prerendered pages (canonical/hreflang/OG), so pass it:
#   docker build --build-arg SITE_URL=https://www.client.gr .
ARG SITE_URL
ENV SITE_URL=$SITE_URL
# Content backends' origins go into the image CSP (img-src, form-action) at build time.
ARG WORDPRESS_URL WORDPRESS_MEDIA_URL STRAPI_URL STRAPI_MEDIA_URL
RUN npm run build

# Drop dev dependencies from the runtime image.
RUN npm prune --omit=dev

# --- runtime -----------------------------------------------------------------
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    TZ=Europe/Athens \
    # sharp/libvips allocate per-thread arenas; capping them keeps RSS predictable.
    MALLOC_ARENA_MAX=2

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/server.mjs /app/package.json ./

# Uploads and the SQLite file live here — mount a volume at /app/data.
RUN mkdir -p /app/data && chown -R 1000:1000 /app/data
# Numeric (the node user): Kubernetes' runAsNonRoot can't verify a user name. The image
# also runs with a read-only root filesystem when /tmp and /app/data are writable mounts.
USER 1000
VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
