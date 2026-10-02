# syntax = docker/dockerfile:1
# system-design.md §12: stage 1 builds the client; stage 2 runs the server's
# .ts directly on Node 24, with SQLite on the /data volume.
FROM docker.io/library/node:24-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.17.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY rules rules
COPY client client
RUN pnpm build

FROM docker.io/library/node:24-slim
WORKDIR /app
RUN npm install -g pnpm@11.17.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY rules rules
COPY server server
COPY --from=build /app/client/dist client/dist
COPY README.md ./
ENV NODE_ENV=production DATA_DIR=/data
CMD ["node", "--max-old-space-size=160", "--disable-warning=ExperimentalWarning", "server/main.ts"]
