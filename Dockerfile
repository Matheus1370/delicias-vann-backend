FROM node:20-alpine AS builder
WORKDIR /app

# argon2 precisa de compilador C para build nativo
RUN apk add --no-cache python3 make g++ openssl-dev

COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

# Prisma engine precisa do OpenSSL
RUN apk add --no-cache openssl

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
