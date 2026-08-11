FROM node:24-alpine AS build

ARG NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}

RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY apps/web apps/web
RUN pnpm --filter @animehub/web build

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000
RUN corepack enable
WORKDIR /workspace

COPY --from=build /workspace/apps/web/.next/standalone ./
COPY --from=build /workspace/apps/web/.next/static apps/web/.next/static
COPY --from=build /workspace/apps/web/public apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
