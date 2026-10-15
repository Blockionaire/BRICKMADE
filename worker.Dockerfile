FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --chown=node:node server ./server
COPY --chown=node:node shared ./shared
COPY --chown=node:node src/domain ./src/domain
COPY --chown=node:node data/catalog/model-colors.json ./data/catalog/model-colors.json
COPY --chown=node:node public/catalog/collision ./public/catalog/collision
COPY --chown=node:node public/catalog/builder-runtime.json ./public/catalog/builder-runtime.json
USER node
CMD ["node", "--import", "./server/register.mjs", "./server/worker-entry.mjs"]
