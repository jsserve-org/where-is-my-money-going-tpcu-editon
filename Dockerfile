FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "npm run db:setup && npm run dev -- --host 0.0.0.0"]
