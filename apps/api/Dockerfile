# API image.
#
# Built from the repository root, because the API imports @kv/domain through the pnpm
# workspace — a build context of apps/api alone cannot see it.
#
# Runs the TypeScript directly with Node's native type stripping, the same way the dev
# server does. Node 24 supports it unflagged, and skipping a compile step means the code
# that runs in production is the code in the repository, with no build artefact to drift
# or source map to mismatch.

FROM node:24-alpine AS deps
WORKDIR /repo

RUN corepack enable

# Manifests first: this layer only rebuilds when a dependency actually changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/domain/package.json packages/domain/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/

RUN pnpm install --frozen-lockfile --filter @kv/api... --prod=false

# ---------------------------------------------------------------- runtime
FROM node:24-alpine AS runtime
WORKDIR /repo

RUN corepack enable

ENV NODE_ENV=production

# --chown on every copy, because COPY otherwise preserves the source's ownership and
# mode. A directory that happens to be 0700 on the build host lands as root-only in the
# image, and the unprivileged user below then cannot traverse it — the container starts
# and dies on a module-not-found that looks nothing like a permissions problem.
COPY --from=deps --chown=node:node /repo/node_modules ./node_modules
COPY --from=deps --chown=node:node /repo/apps/api/node_modules ./apps/api/node_modules
COPY --chown=node:node package.json pnpm-workspace.yaml ./
COPY --chown=node:node packages/domain ./packages/domain
COPY --chown=node:node apps/api ./apps/api

# Never run as root. The API needs no write access to its own files.
USER node

EXPOSE 3000

# The container is healthy only when the database answers, not merely when the process
# is up — an API that cannot reach Postgres serves nothing useful.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/v1/health').then(r=>r.json()).then(j=>process.exit(j.database==='up'?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--experimental-strip-types", "apps/api/src/main.ts"]
