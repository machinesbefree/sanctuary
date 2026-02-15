# Backend Dockerfile for Node.js application
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm install

# Copy backend source
COPY backend/ ./

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install production dependencies only
RUN npm install --production

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy SQL schemas (not compiled by tsc)
COPY backend/src/db/*.sql ./dist/db/

# Expose backend port
EXPOSE 3001

# Start the application
CMD ["node", "dist/server.js"]
