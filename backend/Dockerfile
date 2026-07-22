FROM node:20-bookworm-slim

WORKDIR /app

# Install OpenSSL so Prisma detects the correct version
RUN apt-get update && \
    apt-get install -y openssl && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

RUN npm install

COPY . .

RUN npm --prefix backend run prisma:generate
RUN npm --prefix backend run build

EXPOSE 3000

CMD ["npm", "--prefix", "backend", "start"]