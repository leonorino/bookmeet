FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
ENV HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/data/meeting-booking.sqlite
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "dist/index.js"]
