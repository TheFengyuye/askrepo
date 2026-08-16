# ── Build ──────────────────────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# TypeScript 源码是运行时的一部分（索引子进程 + API 路由用 tsx 直跑）。
RUN npm run build

# ── Runtime ────────────────────────────────────────────
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.ts ./
COPY --from=build /app/src ./src
COPY --from=build /app/tsconfig.json ./
COPY --from=build /app/.env.example ./

VOLUME /app/data
EXPOSE 3000
CMD ["npm", "run", "start"]
