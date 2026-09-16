FROM node:22-slim AS builder

WORKDIR /app

# Install build tools if any native modules need rebuild
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run typecheck && npm run build

FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV RELIQ_DB_PATH=/data/reliq.db

# Create data directory for persistent SQLite volume
RUN mkdir -p /data && mkdir -p /app/data

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/data ./data
COPY --from=builder /app/tsconfig*.json ./
COPY --from=builder /app/vite.config.ts ./

VOLUME ["/data"]

EXPOSE 3001

CMD ["npm", "start"]
