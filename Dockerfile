# PalSafar API — Render Docker build (service root directory = repo root)
# Mirrors render.yaml (env: node, rootDir: server) but as a container build so the
# existing Docker-runtime Render service works without dashboard changes.

FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY server/ .
RUN npx prisma generate
RUN npm run build

# Render injects PORT (default 5000). Migrations are intentionally NOT run here —
# apply pending migrations out-of-band (e.g. `cd server && npm run db:migrate`).
EXPOSE 5000

CMD ["npm", "start"]