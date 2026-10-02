# syntax = docker/dockerfile:1
# system-design.md §12: Node 24 runs the server's .ts directly; SQLite lives
# on the /data volume. The client build stage joins when the client needs one.
FROM docker.io/library/node:24-slim
WORKDIR /app
RUN npm install -g pnpm@11.17.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY rules rules
COPY server server
COPY client client
COPY README.md ./
ENV NODE_ENV=production DATA_DIR=/data
CMD ["node", "--max-old-space-size=160", "--disable-warning=ExperimentalWarning", "server/main.ts"]
