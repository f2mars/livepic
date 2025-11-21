FROM node:20-bookworm-slim

# Install ImageMagick for montage
RUN apt-get update && apt-get install -y --no-install-recommends imagemagick ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps separately for better caching
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

# Copy source
COPY generatePhotos.ts ./generatePhotos.ts
COPY preview ./preview

# Ensure runtime directories exist
RUN mkdir -p input output

# Default grid size can be overridden at runtime
ENV GRID_SIZE=5

# Generate command (expects REPLICATE_API_TOKEN and input/photo.jpeg mounted)
CMD ["sh", "-c", "LIVEPIC_AUTO_CONFIRM=1 npm run generate -- ${GRID_SIZE}"]
