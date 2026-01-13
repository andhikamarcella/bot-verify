FROM eclipse-temurin:17-jre

WORKDIR /app

COPY Lavalink.jar Lavalink.jar
COPY application.yml application.yml

EXPOSE 2333

CMD ["java", "-jar", "Lavalink.jar"]
