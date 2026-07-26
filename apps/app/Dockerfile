# Web image.
#
# Exports the Expo app to static files and serves them with Caddy. The same React Native
# source also ships to iOS and Android through EAS — see ADR-0002 — but that pipeline is
# separate from this container.
#
# EXPO_PUBLIC_API_URL is baked in at BUILD time, not read at runtime: Expo inlines
# EXPO_PUBLIC_* into the bundle. So the image is environment-specific, and staging and
# production need separate builds rather than the same image with different variables.

FROM node:24-alpine AS build
WORKDIR /repo

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/app/package.json apps/app/
COPY packages/domain/package.json packages/domain/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/

RUN pnpm install --frozen-lockfile --filter @kv/app...

COPY packages/domain ./packages/domain
COPY apps/app ./apps/app

ARG EXPO_PUBLIC_API_URL
ENV EXPO_PUBLIC_API_URL=${EXPO_PUBLIC_API_URL}

# Static export: one HTML document per route, so titles and meta are correct per page
# rather than a single empty shell.
RUN cd apps/app && npx expo export --platform web --output-dir /repo/web-dist

# ---------------------------------------------------------------- runtime
FROM caddy:2-alpine AS runtime

COPY --from=build /repo/web-dist /srv
COPY infra/caddy/web.Caddyfile /etc/caddy/Caddyfile

EXPOSE 8080
