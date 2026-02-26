FROM node:20-alpine AS builder

ARG VITE_BASE_PATH=/app2/
ENV VITE_BASE_PATH=$VITE_BASE_PATH


WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:stable-alpine

COPY --from=builder /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]