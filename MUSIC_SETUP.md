# Music Bot Setup Guide

## 🎵 Lavalink Music Streaming Setup

This guide will help you set up music streaming with Lavalink and YouTube support.

### 📋 Prerequisites

1. **Java 11+** - Required for Lavalink
2. **YouTube API Key** (Recommended) - For better YouTube search
3. **Lavalink.jar** - Download from releases

### 🚀 Quick Setup

#### 1. Install Java
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install openjdk-11-jdk

# Windows
# Download and install Java 11 from oracle.com

# Check installation
java -version
```

#### 2. Download Lavalink
1. Go to [Lavalink Releases](https://github.com/lavalink-devs/Lavalink/releases)
2. Download the latest `Lavalink.jar`
3. Place it in the `lavalink/` directory

#### 3. Configure YouTube API (Optional but Recommended)
1. Go to [Google Cloud Console](https://console.developers.google.com/)
2. Create a new project
3. Enable YouTube Data API v3
4. Create credentials → API Key
5. Add the API key to `lavalink/application.yml`:
```yaml
youtube:
  apiKey: "AIzaSyAN6ecNTVFGLm4R-83H4qm7VsFsbpzpMRY"
```

#### 4. Start Lavalink
```bash
# Linux/Mac
cd lavalink
chmod +x start.sh
./start.sh

# Windows
cd lavalink
start.bat
```

#### 5. Configure Environment Variables
Add these to your `.env` file:
```env
# Lavalink Configuration
LAVALINK_HOST=localhost
LAVALINK_PORT=2333
LAVALINK_PASSWORD=youshallnotpass
LAVALINK_CLIENT_ID=your-bot-client-id
```

### 🎮 Music Commands

Once setup is complete, you can use these commands:

#### `/play <query>`
- Play music from YouTube
- Supports URLs and search queries
- Examples:
  - `/play https://www.youtube.com/watch?v=dQw4w9WgXcQ`
  - `/play never gonna give you up`

#### `/skip`
- Skip the current track
- Plays the next track in queue

#### `/stop`
- Stop music and clear the queue
- Disconnects from voice channel

#### `/queue`
- Show current music queue
- Displays now playing and upcoming tracks

#### `/video`
- Start video streaming for YouTube tracks
- Share screen with video content
- Auto-stops when video ends

### 🎥 Video Streaming Features

#### Automatic Video Controls
- **📹** - Start video streaming
- **⏹️** - Stop video streaming  
- **🔁** - Toggle loop mode
- **⏭️** - Skip to next track

#### Video Features
- YouTube video streaming with screen share
- Auto-stop when video ends
- High quality video playback
- Synchronized with audio

### 🔧 Configuration Options

#### Lavalink Settings (`lavalink/application.yml`)
```yaml
server:
  port: 2333          # Lavalink port
  address: localhost  # Lavalink address

lavalink:
  server:
    password: youshallnotpass  # Change this!

plugins:
  - youtube:
      enabled: true
      allowSearch: true
```

#### Bot Settings
- Volume control
- Queue management
- Loop mode
- Auto-disconnect

### 🐛 Troubleshooting

#### Lavalink Won't Start
```bash
# Check Java version
java -version

# Check if port is in use
netstat -an | grep 2333

# Check Lavalink logs
tail -f lavalink.log
```

#### YouTube Search Not Working
1. Add YouTube API key to `application.yml`
2. Enable YouTube Data API v3 in Google Console
3. Restart Lavalink

#### Video Streaming Issues
- Make sure bot has screen share permissions
- Check voice channel quality settings
- Verify YouTube video is available

#### Connection Issues
```bash
# Test Lavalink connection
curl http://localhost:2333/version

# Check if Lavalink is running
ps aux | grep lavalink
```

### 📁 File Structure
```
verify-portal/
├── api/
│   ├── music/
│   │   └── lavalink.js          # Music system
│   └── commands/
│       ├── play.js              # Play command
│       ├── skip.js              # Skip command
│       ├── stop.js              # Stop command
│       ├── queue.js             # Queue command
│       └── video.js             # Video command
├── lavalink/
│   ├── application.yml          # Lavalink config
│   ├── start.sh                 # Linux/Mac startup
│   ├── start.bat                # Windows startup
│   └── lavalink.jar             # Lavalink server (download)
└── .env                         # Environment variables
```

### 🎵 Supported Sources

- ✅ YouTube (videos & music)
- ✅ YouTube Music
- ✅ Direct YouTube URLs
- ✅ YouTube search queries
- ✅ YouTube playlists
- ❌ SoundCloud (disabled by default)

### 🔄 Auto-Features

- **Auto-play next track** when current ends
- **Auto-stop video** when track finishes
- **Auto-disconnect** when queue is empty
- **Auto-reconnect** if connection drops

### 🛡️ Security Notes

1. **Change Lavalink password** from default
2. **Use environment variables** for sensitive data
3. **Limit API key usage** to prevent abuse
4. **Monitor resource usage** for large servers

### 📞 Support

If you encounter issues:
1. Check Lavalink logs
2. Verify Java installation
3. Test YouTube API key
4. Check Discord permissions

Enjoy your music bot! 🎵
