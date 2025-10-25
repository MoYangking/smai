# Enhanced Dockerfile for Node server with modular structure
# No env-based persistence; uses /app/data (JSON files)

FROM node:20-alpine
WORKDIR /app

# Copy package files
COPY package.json ./
COPY package-lock.json* ./

# Copy configuration and public files
COPY config.json ./
COPY public ./public

# Copy source code (modular structure)
COPY src ./src
COPY server.js ./

# Ensure data dir exists (and can be mounted as volume)
RUN mkdir -p /app/data
VOLUME ["/app/data"]

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8787/admin/config', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

EXPOSE 8787
CMD ["node", "server.js"]
