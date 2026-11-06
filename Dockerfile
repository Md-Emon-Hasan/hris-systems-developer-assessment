FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production
ENV DATABASE_URL=file:/app/data/dev.db
RUN npm run db:generate && npm run build
EXPOSE 3000
CMD ["sh", "-c", "mkdir -p /app/data && npm run db:setup && npm run start"]
