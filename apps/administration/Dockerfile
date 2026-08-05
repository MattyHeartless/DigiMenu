FROM node:22-alpine AS dependencies
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/administration/package.json apps/administration/package.json
COPY apps/menus/package.json apps/menus/package.json
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* is bundled into client-side JavaScript during the build.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build --workspace=@digimenu/administration

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/administration/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/administration/.next/static ./apps/administration/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/administration/public ./apps/administration/public

USER nextjs
EXPOSE 3000
CMD ["node", "apps/administration/server.js"]
