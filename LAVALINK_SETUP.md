# 🎵 Lavalink Setup Instructions

## 📋 Quick Setup

### 1. Download Lavalink.jar
```bash
# Download latest Lavalink
curl -L -o lavalink.jar https://github.com/lavalink-devs/Lavalink/releases/download/4.0.0/Lavalink.jar

# Atau download manual dari:
# https://github.com/lavalink-devs/Lavalink/releases
```

### 2. Update application.yml
```yaml
server:
  port: 2333
  address: 0.0.0.0

lavalink:
  server:
    password: "youshallnotpass"
    sources:
      youtube: true
      youtubemusic: true
    bufferDurationMs: 400
    frameBufferDurationMs: 5000
    opusEncodingQuality: 10
    youtubePlaylistLoadLimit: 6
    playerUpdateInterval: 5
    useSeekGhosting: true
    youtubeSearchEnabled: true
    soundcloudSearchEnabled: false
    gcWarnings: true

metrics:
  prometheus:
    enabled: false
    endpoint: /metrics

plugins:
  - dependency: "com.dunctebot:spotify:2.0.0"
    repository: "https://maven.dunctebot.com/releases"
  - dependency: "com.github.topi-gmbh:sponsorblock-connector:1.0.0"
    repository: "https://jitpack.io"

sentry:
  dsn: ""
  environment: ""
```

### 3. Start Lavalink
```bash
java -jar lavalink.jar
```

### 4. Railway Deployment
```yaml
# railway.yml
build:
  builder: NIXPACKS
deploy:
  startCommand: "java -jar lavalink.jar"
  restartPolicyType: ON_FAILURE
  restartPolicyMaxRetries: 10
```

### 5. Environment Variables (Railway)
```env
SERVER_PORT=2333
LAVALINK_SERVER_PASSWORD=youshallnotpass
JAVA_VERSION=17
```

## 🔧 Bot Configuration

Update .env:
```env
LAVALINK_HOST=lavalink-verify.up.railway.app
LAVALINK_PORT=443
LAVALINK_PASSWORD=youshallnotpass
LAVALINK_SECURE=true
```

## 🚀 Testing
```bash
# Test Lavalink connection
curl http://localhost:2333/version

# Test bot music
/play never gonna give you up
```

## 📱 Commands
- `/play <query>` - Play music
- `/skip` - Skip track
- `/stop` - Stop music
- `/queue` - Show queue
- `/video` - Start video

## 🐛 Troubleshooting

### Lavalink not connecting:
- Check Lavalink is running
- Verify host/port/password
- Check firewall settings

### Music not playing:
- User must be in voice channel
- Check bot permissions
- Verify YouTube API key

### Audio issues:
- Check audio drivers
- Verify Discord voice permissions
- Restart voice connection
