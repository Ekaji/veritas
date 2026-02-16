# Build Stage
FROM node:20-slim AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code and IDL
COPY . .
# Build TypeScript
RUN npm run build

# Production Stage
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy built artifacts and IDL from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/idl ./idl

# Run as non-root user
USER node

# Start agent
CMD ["node", "dist/loop.js"]
