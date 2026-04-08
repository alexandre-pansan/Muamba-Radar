FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# MAMU_API_URL — leave empty to use nginx proxy (recommended).
# Set to a full URL (e.g. https://api.myhost.com) only when
# the API is served from a different domain.
ENV MUAMBA_API_URL=""

ENTRYPOINT ["/docker-entrypoint.sh"]
