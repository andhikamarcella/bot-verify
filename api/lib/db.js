const { MongoClient } = require('mongodb');

let cachedClient = null;
let cachedDb = null;

async function connectMongo() {
  if (cachedDb) {
    return cachedDb;
  }

  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not defined in environment variables');
  }

  const client = new MongoClient(uri);
  await client.connect();

  const dbNameFromUri = uri.split('/')[3]?.split('?')[0] || 'verifybot';
  const db = client.db(dbNameFromUri);

  cachedClient = client;
  cachedDb = db;

  console.log('✅ MongoDB connected!');
  return db;
}

module.exports = {
  connectMongo,
};
