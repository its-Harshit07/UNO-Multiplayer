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

# Prisma
WORKDIR /app/backend

RUN npm run prisma:generate

# Build
RUN npm run build 

WORKDIR /app

EXPOSE 3000

CMD ["node", "backend/dist/backend/src/server.js"]
