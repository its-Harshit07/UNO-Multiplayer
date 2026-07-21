FROM node:20-alpine

WORKDIR /app

# Copy root configurations and workspace package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies using npm workspace resolution
RUN npm ci

# Copy source files
COPY backend ./backend
COPY shared ./shared

# Generate Prisma Client
RUN npx --prefix backend prisma generate

# Compile TypeScript
RUN npm --prefix backend run build

EXPOSE 3000

CMD ["node", "backend/dist/backend/src/server.js"]
