FROM node:20-alpine
WORKDIR /application

COPY package.json package-lock.json* ./
COPY models.json ./
COPY src ./src

RUN npm install --omit=dev

EXPOSE 11434
CMD ["node", "./src/index.js"]
