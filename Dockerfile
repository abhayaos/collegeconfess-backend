FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
COPY dist /app/dist
EXPOSE 5000
CMD ["node", "server.js"]
