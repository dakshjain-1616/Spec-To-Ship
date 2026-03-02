FROM node:20

WORKDIR /root/SpecShip

COPY package*.json ./
RUN npm install

COPY . .
RUN npx tsc

EXPOSE 3000

CMD ["npm", "start"]
