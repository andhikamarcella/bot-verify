FROM eclipse-temurin:17-jre

WORKDIR /app
ENV LAVALINK_SERVER_PASSWORD=youshallnotpass

RUN apt-get update && apt-get install -y curl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN curl -L -o Lavalink.jar https://github.com/lavalink-devs/Lavalink/releases/latest/download/Lavalink.jar
COPY lavalink/railway.yml /app/application.yml

EXPOSE 2333

CMD ["sh","-lc","java -jar Lavalink.jar --spring.config.location=application.yml --server.port=${PORT:-2333}"]
