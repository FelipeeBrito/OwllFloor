# syntax=docker/dockerfile:1
# OwllFloor em container: página compilada + servidor local.
# Duas fases: a primeira compila, a segunda só roda. Assim o código-fonte da página
# e o cache do npm não vão para a imagem final.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    # Sem navegador dentro do container.
    OF_NO_OPEN=1 \
    # Escuta em todas as interfaces do container; o acesso é limitado na publicação da porta
    # (127.0.0.1:4747:4747 no compose.yaml). Ver docs/adr/0003-docker-ci-demo.md.
    OF_BIND_ALL=1
COPY --from=build /app/package.json ./
# O servidor roda TypeScript direto com o tsx, então as dependências vêm inteiras da fase de build.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/vite.config.ts /app/tsconfig.json ./
# Usuário sem privilégios (já existe na imagem oficial do Node).
USER node
EXPOSE 4747
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:4747/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Padrão: modo demo, que funciona sem nenhuma configuração.
CMD ["node_modules/.bin/tsx", "src/server/main.ts", "--static", "--demo"]
