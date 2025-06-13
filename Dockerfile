# Etapa 1: Construção (se necessário, mas para Node.js simples pode não ser uma etapa separada)
# Usar uma imagem Node.js oficial como base. Escolha uma versão LTS.
# Alpine Linux é usado para manter a imagem pequena.
FROM node:18-alpine AS base

# Definir o diretório de trabalho no contêiner
WORKDIR /usr/src/app

# Copiar package.json e package-lock.json (ou yarn.lock)
# Isso aproveita o cache de camadas do Docker. Se esses arquivos não mudarem,
# o 'npm install' não será executado novamente em builds subsequentes.
COPY package*.json ./

# Instalar as dependências da aplicação
# --production para não instalar devDependencies e economizar espaço
# --ignore-scripts pode ser adicionado se você não tiver scripts de post-install críticos
RUN npm install --production

# Copiar o restante dos arquivos da aplicação para o diretório de trabalho
COPY . .

# Expor a porta que a aplicação usa DENTRO do contêiner (definida no seu server.js)
# Mesmo que você vá mapear para a porta 80 do host, o contêiner internamente usa a porta 80.
EXPOSE 80

# Comando para rodar a aplicação quando o contêiner iniciar
# Isso executará seu server.js
CMD [ "node", "server.js" ]
