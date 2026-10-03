# Strapi for the strapi module: production mode (prebuilt admin, no file watchers),
# SQLite on the /data volume, uploads on /opt/app/public/uploads.
FROM node:22-bookworm-slim AS deps
WORKDIR /opt/app
ENV NODE_ENV=production STRAPI_TELEMETRY_DISABLED=true
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

FROM deps AS build
COPY config ./config
COPY src ./src
COPY public ./public
COPY database ./database
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /opt/app
ENV NODE_ENV=production \
    STRAPI_TELEMETRY_DISABLED=true \
    DATABASE_FILENAME=/data/strapi.db \
    # The CLI writes its config under $HOME, which is read-only in Kubernetes.
    XDG_CONFIG_HOME=/tmp \
    # Strapi idles around 200 MB; the cap keeps a busy admin from growing unbounded.
    NODE_OPTIONS=--max-old-space-size=384
COPY --from=deps /opt/app/node_modules ./node_modules
COPY --from=build /opt/app/build ./build
COPY package.json favicon.png ./
COPY config ./config
COPY src ./src
COPY public ./public
COPY database ./database
# What Strapi fills empty site-page fields with on start: `npm run strapi:seed`, run by CI
# before this build. Without it (only seed/.gitignore) the fill is skipped.
COPY seed ./seed
RUN mkdir -p /data public/uploads && chown -R 1000:1000 /data public/uploads
# Numeric (the node user): Kubernetes' runAsNonRoot can't verify a user name. Runs with a
# read-only root filesystem: only /data, /opt/app/public/uploads and /tmp are written.
USER 1000
VOLUME ["/data", "/opt/app/public/uploads"]
EXPOSE 1337
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --retries=10 \
  CMD node -e "fetch('http://127.0.0.1:1337/_health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "node_modules/@strapi/strapi/bin/strapi.js", "start"]
