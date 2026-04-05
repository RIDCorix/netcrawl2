FROM node:20-slim

WORKDIR /app

# Install deps (including devDeps for tsc)
COPY package.json ./
RUN npm install

# Copy source and build
COPY src/ ./src/
COPY tsconfig.json ./
RUN npx tsc

# Prune devDeps
RUN npm prune --production

ENV PORT=4800
ENV NETCRAWL_MULTI_USER=true
ENV NETCRAWL_DATA_DIR=/app/data

EXPOSE 4800

CMD ["node", "dist/index.js"]
