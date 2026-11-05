# Build the web app, then run the server with the built files beside it.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY shared shared
COPY web web
RUN npm run build -w web

FROM node:22-slim
ARG VCS_REPOSITORY_URL_FULL=
ARG VCS_REF_HEAD_REVISION=
ENV VCS_REPOSITORY_URL_FULL=$VCS_REPOSITORY_URL_FULL
ENV VCS_REF_HEAD_REVISION=$VCS_REF_HEAD_REVISION
ENV NODE_ENV=production
ENV PORT=5050
ENV WEB_DIST=/app/web/dist
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev -w server
COPY shared shared
COPY server server
COPY --from=build /app/web/dist web/dist
EXPOSE 5050
CMD ["node", "--import", "tsx", "--import", "./server/src/instrumentation.ts", "server/src/index.ts"]
