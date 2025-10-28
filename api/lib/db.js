// Centralised MongoDB connection helper using the official driver.
const { MongoClient } = require('mongodb');
const debug = require('util').debuglog('db');

let client;
let db;

const DEFAULT_URI = 'mongodb://127.0.0.1:27017/discord-verification';
const DB_NAME = 'discordVerification';

async function connectMongo() {
  if (db) {
    return db;
  }
  const uri = process.env.MONGODB_URI || DEFAULT_URI;
  if (!client) {
    client = new MongoClient(uri, {
      ignoreUndefined: true,
    });
    client.on('error', (err) => {
      console.error('MongoDB client error', err);
    });
  }
  if (!client.topology || client.topology.isDestroyed()) {
    await client.connect();
    debug('MongoDB client connected');
  } else if (!client.topology.isConnected()) {
    await client.connect();
  }
  db = client.db(DB_NAME);
  return db;
}

async function getCollection(name) {
  const database = await connectMongo();
  return database.collection(name);
}

module.exports = {
  connectMongo,
  getCollection,
};
