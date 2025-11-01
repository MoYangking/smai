# Build a small Node.js runtime image
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --only=production

COPY config ./config
COPY src ./src
COPY public ./public
COPY data ./data

EXPOSE 3000

CMD ["node", "src/index.js"]

