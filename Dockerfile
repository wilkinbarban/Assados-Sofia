# Stage 1: Install dependencies only when needed
FROM node:24-alpine AS deps
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on package-lock.json
COPY package.json package-lock.json ./
RUN npm ci --loglevel=error

# Stage 2: Rebuild the source code only when needed
FROM node:24-alpine AS builder
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable telemetry during Next.js build
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Stage 3: Production image runner
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# server.js is created by next build from the standalone output
CMD ["node", "server.js"]
