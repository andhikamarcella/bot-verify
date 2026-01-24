FROM eclipse-temurin:17-jre

WORKDIR /app
ENV SERVER_PORT=2333
ENV LAVALINK_SERVER_PASSWORD=youshallnotpass

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN curl -L -o Lavalink.jar https://github.com/lavalink-devs/Lavalink/releases/latest/download/Lavalink.jar
RUN cat > application.yml << 'EOF'
server:
  port: 2333
lavalink:
  plugins:
    - dependency: "dev.lavalink.youtube:youtube-plugin:1.16.0"
      snapshot: false
  server:
    password: "youshallnotpass"
    sources:
      youtube: false
      bandcamp: true
      soundcloud: true
      twitch: true
      vimeo: true
      http: true
      local: false
    filters: {}
    ws:
      path: "/v4/websocket"
plugins:
  youtube:
    enabled: true
    allowSearch: true
    allowDirectVideoIds: true
    allowDirectPlaylistIds: true
logging:
  file:
    path: ./logs/
  level:
    ROOT: INFO
    lavalink: INFO
EOF

EXPOSE 2333

CMD ["sh","-lc","java -jar Lavalink.jar --server.port=${PORT:-2333}"]
