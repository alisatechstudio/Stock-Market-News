/**
 * World Stock News - MongoDB Connection & Data Access Layer
 * Optimized for Vercel Serverless Functions & Connection Pooling
 */

const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || process.env.MONGODB_URL || '';
const dbName = process.env.MONGODB_DB || process.env.MONGODB_DATABASE || 'stock_market_news';

let client = null;
let clientPromise = null;
let hasSeeded = false;

function isMongoConfigured() {
  return Boolean(uri && uri.trim().length > 0);
}

if (isMongoConfigured()) {
  const options = {
    maxPoolSize: 10,
    minPoolSize: 1,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000
  };

  if (process.env.NODE_ENV === 'development') {
    // Preserve client across module reloads in local dev
    if (!global._mongoClientPromise) {
      client = new MongoClient(uri, options);
      global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
  } else {
    // In serverless production environments, cache on global to reuse across warm lambdas
    if (!global._mongoClientPromise) {
      client = new MongoClient(uri, options);
      global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
  }
}

/**
 * Get connected MongoDB database instance
 */
async function getDb() {
  if (!isMongoConfigured() || !clientPromise) {
    return null;
  }
  try {
    const connectedClient = await clientPromise;
    return connectedClient.db(dbName);
  } catch (err) {
    console.warn('[MongoDB] Connection warning:', err.message);
    return null;
  }
}

/**
 * Get the articles collection
 */
async function getArticlesCollection() {
  const db = await getDb();
  if (!db) return null;
  return db.collection('articles');
}

/**
 * Seed articles collection on initial setup if empty
 */
async function seedInitialArticles(articles) {
  if (!isMongoConfigured() || hasSeeded || !Array.isArray(articles) || articles.length === 0) {
    return;
  }
  try {
    const col = await getArticlesCollection();
    if (!col) return;

    const count = await col.countDocuments();
    if (count === 0) {
      console.log(`[MongoDB] Initializing collection with ${articles.length} seed articles...`);
      // Create indexes for high-speed queries
      await col.createIndex({ id: 1 }, { unique: true });
      await col.createIndex({ publishedAt: -1 });
      await col.createIndex({ categorySlug: 1, publishedAt: -1 });

      const operations = articles.map(art => ({
        updateOne: {
          filter: { id: art.id },
          update: { $set: art },
          upsert: true
        }
      }));
      await col.bulkWrite(operations);
      console.log(`[MongoDB] Successfully seeded articles collection.`);
    }
    hasSeeded = true;
  } catch (err) {
    console.warn('[MongoDB] Seeding notice:', err.message);
  }
}

/**
 * Retrieve article by ID from MongoDB
 */
async function getArticleById(id) {
  if (!isMongoConfigured()) return null;
  try {
    const col = await getArticlesCollection();
    if (!col) return null;
    return await col.findOne({ id });
  } catch (err) {
    console.warn(`[MongoDB] Error fetching article "${id}":`, err.message);
    return null;
  }
}

/**
 * Retrieve list of articles from MongoDB with optional category filtering
 */
async function getArticles({ limit = 35, category = null, skip = 0 } = {}) {
  if (!isMongoConfigured()) return null;
  try {
    const col = await getArticlesCollection();
    if (!col) return null;

    const query = {};
    if (category) {
      query.categorySlug = category.toLowerCase().trim();
    }

    const docs = await col.find(query)
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    return docs;
  } catch (err) {
    console.warn('[MongoDB] Error querying articles:', err.message);
    return null;
  }
}

/**
 * Upsert newly ingested articles into MongoDB
 */
async function upsertArticles(articles) {
  if (!isMongoConfigured() || !Array.isArray(articles) || articles.length === 0) {
    return { upsertedCount: 0, modifiedCount: 0 };
  }
  try {
    const col = await getArticlesCollection();
    if (!col) return { upsertedCount: 0, modifiedCount: 0 };

    const operations = articles.map(art => ({
      updateOne: {
        filter: { id: art.id },
        update: { $set: art },
        upsert: true
      }
    }));

    const result = await col.bulkWrite(operations);
    return {
      upsertedCount: result.upsertedCount || 0,
      modifiedCount: result.modifiedCount || 0
    };
  } catch (err) {
    console.error('[MongoDB] Error upserting articles:', err.message);
    return { error: err.message };
  }
}

module.exports = {
  isMongoConfigured,
  getDb,
  getArticlesCollection,
  seedInitialArticles,
  getArticleById,
  getArticles,
  upsertArticles
};
