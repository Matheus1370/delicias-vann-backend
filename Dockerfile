FROM node:20-alpine AS builder
WORKDIR /app

# argon2 precisa de compilador C; sharp precisa de libvips
RUN apk add --no-cache python3 make g++ openssl-dev vips-dev

COPY package*.json ./
RUN npm install --ignore-scripts=false
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

# Prisma engine precisa do OpenSSL; sharp em runtime precisa de libvips
RUN apk add --no-cache openssl vips

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
