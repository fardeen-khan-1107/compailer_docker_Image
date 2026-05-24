FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    gcc \
    g++ \
    openjdk-17-jdk \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install numpy pandas matplotlib scikit-learn

WORKDIR /app
