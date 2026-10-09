FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# 7G - URL del backend. `lib/api.ts` usa `VITE_API_URL`, con valor por defecto
# `http://localhost:8000/api`. En un despliegue hay que fijarlo aqui: si no,
# el navegador del visitante apuntara a SU localhost:8000 y no encontrara nada.
# Es un valor de compilacion, no de ejecucion.
ARG VITE_API_URL=http://localhost:8000/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build
FROM nginx:alpine
# 9E: SPA fallback. Sin `try_files`, `/public/compositions/<token>` daria 404
# en nginx (no hay fichero con ese nombre) y el enlace publico no abriria.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
