FROM node:20-alpine
WORKDIR /app
COPY server.js package.json ./
EXPOSE 8080
USER node
CMD ["node", "server.js"]
