FROM eclipse-temurin:17-jre

WORKDIR /app
ENV SERVER_PORT=2333
ENV LAVALINK_SERVER_PASSWORD=youshallnotpass

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN curl -L -o Lavalink.jar https://github.com/lavalink-devs/Lavalink/releases/latest/download/Lavalink.jar
RUN cat > application.yml << 'EOF'\nserver:\n  port: 2333\nlavalink:\n  server:\n    password: \"youshallnotpass\"\n    sources:\n      youtube: true\n      bandcamp: true\n      soundcloud: true\n      twitch: true\n      vimeo: true\n      http: true\n      local: false\n    filters: true\n    ws:\n      path: \"/v4/websocket\"\nlogging:\n  file:\n    path: ./logs/\n  level:\n    ROOT: INFO\n    lavalink: INFO\nEOF

EXPOSE 2333

CMD ["java", "-jar", "Lavalink.jar"]
