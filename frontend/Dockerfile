# Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Copy root configurations and workspace package files
COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies using npm workspace resolution
RUN npm ci

# Copy source files
COPY frontend ./frontend
COPY shared ./shared

# Compile frontend
RUN npm --prefix frontend run build

# Serve stage
FROM nginx:alpine
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
