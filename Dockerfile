FROM eclipse-temurin:17-jre

WORKDIR /app

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN curl -L -o Lavalink.jar https://github.com/lavalink-devs/Lavalink/releases/latest/download/Lavalink.jar
RUN printf "server:\n  port: 2333\nlavalink:\n  server:\n    password: \"youshallnotpass\"\n    sources:\n      youtube: true\n      bandcamp: true\n      soundcloud: true\n      twitch: true\n      vimeo: true\n      http: true\n      local: false\n    filters: true\nlogging:\n  file:\n    path: ./logs/\n  level:\n    ROOT: INFO\n" > application.yml

EXPOSE 2333

CMD ["java", "-jar", "Lavalink.jar"]
