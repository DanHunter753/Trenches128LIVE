# Trench 128 game server. Build: docker build -t trench128 .   Run: see docker-compose.yml and DEPLOY.md
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY *.js ./
COPY public ./public
COPY scripts ./scripts
COPY licenses ./licenses
# ship three.js inside the image (falls back to the CDN if the build machine is offline)
RUN node scripts/fetch-three.js || true
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production PORT=8080 T128_DATA=/data
VOLUME /data
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1
CMD ["node", "server.js", "--trust-proxy", "--no-fetch"]
