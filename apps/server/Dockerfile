FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/server/package*.json ./apps/server/

RUN npm install

COPY packages/shared ./packages/shared
COPY apps/server ./apps/server

RUN npm run build --workspace=@echo-drift/shared
RUN npm run build --workspace=@echo-drift/server

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package*.json ./packages/shared/
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package*.json ./apps/server/
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3001
CMD ["node", "apps/server/dist/server.js"]
