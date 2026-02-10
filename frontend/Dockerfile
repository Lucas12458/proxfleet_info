# --- ÉTAPE 1 : Build (Node.js) ---
FROM node:20-alpine AS builder

WORKDIR /app

# On copie d'abord les fichiers de dépendances pour profiter du cache Docker
COPY package*.json ./
RUN npm install

# On copie le reste du code et on build
COPY . .
RUN npm run build

# --- ÉTAPE 2 : Production (Nginx) ---
FROM nginx:stable-alpine

# On copie les fichiers compilés depuis l'étape précédente
COPY --from=builder /app/dist /usr/share/nginx/html

# Optionnel : On copie une config Nginx personnalisée si besoin (ex: pour React Router)
# COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]