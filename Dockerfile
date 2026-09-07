FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PORT=3000 \
    T2W_TRUST_PROXY=true

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY public ./public
COPY server ./server
COPY supabase ./supabase

EXPOSE 3000
CMD ["node", "server/index.js"]
