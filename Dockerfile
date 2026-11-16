FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js connectionWrapper.js limiter.js ./
COPY public ./public

ENV NODE_ENV=production
ENV PORT=8081
EXPOSE 8081

CMD ["node", "server.js"]
