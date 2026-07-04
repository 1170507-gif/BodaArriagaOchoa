# Use a lightweight Node.js 22 base image
FROM node:22-slim AS builder

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install all dependencies (including devDependencies needed for build)
RUN npm ci

# Copy the rest of the application files
COPY . .

# Run the build script (Vite SPA + Node.js server bundle)
RUN npm run build

# Remove development dependencies to optimize image size
RUN npm prune --production


# Final production runner stage
FROM node:22-slim

WORKDIR /app

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Copy necessary production files from builder stage
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Expose port 8080 (matching Fly.io configuration)
EXPOSE 8080

# Start the application
CMD ["node", "dist/server.cjs"]
