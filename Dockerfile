# Two images from one build: `server` (Fastify + WebSocket, talks to Redis)
# and `web` (nginx serving the UI and proxying /api and /ws to the server,
# so the browser only ever sees one origin). See deploy/ and scripts/deploy.sh.
#
#   docker build --target server -t dangerous-inclinations-server .
#   docker build --target web    -t dangerous-inclinations-web .

ARG NODE_IMAGE=node:24-bookworm-slim

# --- dependencies and build ---------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV YARN="node .yarn/releases/yarn-4.12.0.cjs"
# The workspaces' scripts call tsc and vite, which live in the root workspace.
ENV PATH=/app/node_modules/.bin:$PATH
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases .yarn/releases
COPY engine/package.json engine/
COPY server/package.json server/
COPY ui/package.json ui/
RUN $YARN install --immutable
COPY tsconfig.json ./
COPY engine engine
COPY server server
COPY ui ui
RUN $YARN workspace @dangerous-inclinations/engine build \
 && $YARN workspace @dangerous-inclinations/server build \
 && $YARN workspace @dangerous-inclinations/ui build

# --- the server's production dependencies only --------------------------------
FROM ${NODE_IMAGE} AS server-deps
WORKDIR /app
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases .yarn/releases
COPY engine/package.json engine/
COPY server/package.json server/
COPY ui/package.json ui/
RUN node .yarn/releases/yarn-4.12.0.cjs workspaces focus @dangerous-inclinations/server --production

# --- server -------------------------------------------------------------------
FROM ${NODE_IMAGE} AS server
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    RECORDINGS_DIR=/data/recordings
WORKDIR /app
COPY --from=server-deps /app/node_modules node_modules
COPY --from=build /app/engine/package.json engine/package.json
COPY --from=build /app/engine/dist engine/dist
COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/server/dist server/dist
# A named volume mounted here inherits this ownership on first use.
RUN mkdir -p /data/recordings && chown -R node:node /data
USER node
WORKDIR /app/server
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/index.js"]

# --- web ----------------------------------------------------------------------
FROM nginx:1.27-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/ui/dist /usr/share/nginx/html
EXPOSE 80
