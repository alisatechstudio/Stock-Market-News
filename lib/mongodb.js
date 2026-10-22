/**
 * World Stock News - MongoDB Connection & Data Access Layer
 * Optimized for Vercel Serverless Functions & Connection Pooling
 */

const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || process.env.MONGODB_URL || '';

function resolveDbName() {
  if (process.env.MONGODB_DB && process.env.MONGODB_DB.trim()) {
    return process.env.MONGODB_DB.trim();
  }
  if (process.env.MONGODB_DATABASE && process.env.MONGODB_DATABASE.trim()) {
    return process.env.MONGODB_DATABASE.trim();
  }
  if (uri) {
    try {
      const match = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/);
      if (match && match[1] && match[1].trim()) {
        return match[1].trim();
      }
    } catch (_) {}
  }
  return 'stock_market_news';
}

const dbName = resolveDbName();

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
  if (!isMongoConfigured()) {
    return { success: false, reason: 'MONGODB_URI not configured' };
  }
  const itemsToSeed = Array.isArray(articles) && articles.length > 0
    ? articles
    : (function() {
        try {
          return require('../js/articles-data.js').ArticlesData || [];
        } catch (_) {
          return [];
        }
      })();

  if (!itemsToSeed || itemsToSeed.length === 0) {
    return { success: false, reason: 'No articles available to seed' };
  }

  try {
    const col = await getArticlesCollection();
    if (!col) return { success: false, reason: 'Failed to access articles collection' };

    const count = await col.countDocuments();
    if (count === 0) {
      console.log(`[MongoDB] Initializing collection with ${itemsToSeed.length} seed articles...`);
      // Create indexes for high-speed queries
      try {
        await col.createIndex({ id: 1 }, { unique: true });
        await col.createIndex({ publishedAt: -1 });
        await col.createIndex({ categorySlug: 1, publishedAt: -1 });
      } catch (idxErr) {
        console.warn('[MongoDB] Index creation notice:', idxErr.message);
      }

      const operations = itemsToSeed.map(art => ({
        updateOne: {
          filter: { id: art.id },
          update: { $set: art },
          upsert: true
        }
      }));
      const writeResult = await col.bulkWrite(operations);
      hasSeeded = true;
      const totalInDb = await col.countDocuments();
      console.log(`[MongoDB] Successfully seeded articles collection. Total: ${totalInDb}`);
      return {
        success: true,
        seededCount: itemsToSeed.length,
        upsertedCount: writeResult.upsertedCount || itemsToSeed.length,
        totalInDb
      };
    } else {
      hasSeeded = true;
      return {
        success: true,
        alreadySeeded: true,
        totalInDb: count
      };
    }
  } catch (err) {
    console.warn('[MongoDB] Seeding notice:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Retrieve article by ID from MongoDB (with auto-seed fallback)
 */
async function getArticleById(id) {
  if (!isMongoConfigured()) return null;
  try {
    const col = await getArticlesCollection();
    if (!col) return null;
    let doc = await col.findOne({ id });
    if (!doc) {
      const count = await col.countDocuments();
      if (count === 0) {
        await seedInitialArticles();
        doc = await col.findOne({ id });
      }
    }
    return doc;
  } catch (err) {
    console.warn(`[MongoDB] Error fetching article "${id}":`, err.message);
    return null;
  }
}

/**
 * Retrieve list of articles from MongoDB with optional category filtering (auto-seeds if empty)
 */
async function getArticles({ limit = 35, category = null, skip = 0, autoSeed = true } = {}) {
  if (!isMongoConfigured()) return null;
  try {
    const col = await getArticlesCollection();
    if (!col) return null;

    let count = await col.countDocuments();
    if (count === 0 && autoSeed) {
      await seedInitialArticles();
      count = await col.countDocuments();
    }

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

/**
 * Get comprehensive MongoDB connection & collection diagnostics
 */
async function getDbStatus() {
  if (!isMongoConfigured()) {
    return {
      configured: false,
      connected: false,
      database: dbName,
      message: 'MONGODB_URI environment variable is not configured.'
    };
  }
  try {
    const db = await getDb();
    if (!db) {
      return {
        configured: true,
        connected: false,
        database: dbName,
        error: 'Failed to connect to MongoDB cluster'
      };
    }
    const collections = await db.listCollections().toArray();
    const colNames = collections.map(c => c.name);
    let articleCount = 0;
    if (colNames.includes('articles')) {
      articleCount = await db.collection('articles').countDocuments();
    }
    return {
      configured: true,
      connected: true,
      database: db.databaseName,
      collections: colNames,
      articleCount
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      database: dbName,
      error: err.message
    };
  }
}

module.exports = {
  isMongoConfigured,
  getDb,
  getDbName: () => dbName,
  getArticlesCollection,
  seedInitialArticles,
  getArticleById,
  getArticles,
  upsertArticles,
  getDbStatus
};
