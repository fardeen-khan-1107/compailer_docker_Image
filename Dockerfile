FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    gcc \
    g++ \
    sqlite3 \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir numpy pandas matplotlib

WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 5000

CMD ["npm", "start"]