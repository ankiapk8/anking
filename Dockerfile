FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copy all package files for better caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/anki-generator/package.json ./artifacts/anki-generator/
COPY lib/db/package.json ./lib/db/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/integrations-openai-ai-server/package.json ./lib/integrations-openai-ai-server/
COPY lib/api-client-react/package.json ./lib/api-client-react/

# Install dependencies for all packages
RUN pnpm install

# Copy everything else
COPY . .

# Build only the necessary packages (Frontend and Backend)
RUN pnpm --filter "@workspace/api-server" --filter "@workspace/anki-generator" -r --if-present run build

# Production Stage
FROM node:22-slim
WORKDIR /app
RUN corepack enable

# Copy only the necessary files for production to keep image small
COPY --from=base /app /app

EXPOSE 3000
ENV NODE_ENV=production

WORKDIR /app/artifacts/api-server
CMD ["node", "dist/index.mjs"]
