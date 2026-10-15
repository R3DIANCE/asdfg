FROM oven/bun:1.2-slim AS base
WORKDIR /app

# Install dependencies
COPY package.json ./
RUN bun install --frozen-lockfile || bun install

# Copy application source code and game data
COPY . .

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Start Maple Wayfarer server
CMD ["bun", "run", "server.ts"]
