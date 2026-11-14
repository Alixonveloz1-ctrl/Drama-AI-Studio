# Drama AI Studio en Cloud Run: un proceso Node sin dependencias
# (las funciones de api/ solo usan la librería estándar y fetch).
FROM node:22-slim
WORKDIR /app
COPY servidor.js ./
COPY index.html ./
COPY entrar ./entrar
COPY estudio ./estudio
COPY api ./api
COPY comun ./comun
ENV NODE_ENV=production
CMD ["node", "servidor.js"]
