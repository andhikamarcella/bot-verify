#!/bin/bash

# Lavalink Startup Script
# This script starts Lavalink server for music streaming

echo "🎵 Starting Lavalink Server..."

# Check if Java is installed
if ! command -v java &> /dev/null; then
    echo "❌ Java is not installed. Please install Java 11 or higher."
    exit 1
fi

# Check if Lavalink.jar exists
if [ ! -f "lavalink.jar" ]; then
    echo "❌ Lavalink.jar not found!"
    echo "Please download Lavalink.jar from: https://github.com/lavalink-devs/Lavalink/releases"
    echo "And place it in the lavalink/ directory"
    exit 1
fi

# Start Lavalink
echo "🚀 Starting Lavalink on port 2333..."
cd "$(dirname "$0")"
java -jar lavalink.jar

echo "✅ Lavalink server stopped"
