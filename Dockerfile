FROM eclipse-temurin:17-jre

WORKDIR /app
ENV SERVER_PORT=2333
ENV LAVALINK_SERVER_PASSWORD=youshallnotpass

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN curl -L -o Lavalink.jar https://github.com/lavalink-devs/Lavalink/releases/latest/download/Lavalink.jar
RUN printf "server:\n  port: 2333\nlavalink:\n  server:\n    password: \"youshallnotpass\"\n" > application.yml

EXPOSE 2333

CMD ["java", "-jar", "Lavalink.jar"]
