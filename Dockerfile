FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS admin-builder
WORKDIR /admin
COPY admin/package*.json ./
RUN npm ci
COPY admin/ .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app

# Install runtime deps
COPY package*.json ./
RUN npm ci --production

# Copy built backend
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=backend-builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma

# Copy admin panel build
COPY --from=admin-builder /admin/dist ./admin/dist

# Create data directories
RUN mkdir -p /app/data /app/uploads

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/seed.js 2>/dev/null; node dist/index.js"]
