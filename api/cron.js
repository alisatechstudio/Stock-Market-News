/**
 * Vercel Cron Ingestion Function
 * Automatically invoked hourly via Vercel Cron to fetch financial wires,
 * update MongoDB Atlas database, and refresh live feeds.
 */

const { runUpdate } = require('../scripts/hourly-update.js');
const mongodb = require('../lib/mongodb.js');
const { ArticlesData } = require('../js/articles-data.js');

module.exports = async (req, res) => {
  // Verify Vercel Cron authorization if CRON_SECRET is set
  const authHeader = req.headers['authorization'];
  if (process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid CRON_SECRET' });
    }
  }

  try {
    // If MongoDB is configured and empty, auto-seed initial articles
    let seedInfo = null;
    if (mongodb.isMongoConfigured()) {
      try {
        const dbStatus = await mongodb.getDbStatus();
        if (dbStatus.connected && (dbStatus.articleCount === 0 || !dbStatus.collections.includes('articles'))) {
          seedInfo = await mongodb.seedInitialArticles(ArticlesData);
        }
      } catch (seedErr) {
        console.warn('[Vercel Cron Seed Notice]:', seedErr.message);
      }
    }

    const result = await runUpdate();
    const currentDbStatus = mongodb.isMongoConfigured() ? await mongodb.getDbStatus() : null;

    res.setHeader('Cache-Control', 'no-cache');
    return res.status(200).json({
      success: true,
      message: 'Vercel Cron Ingestion Completed Successfully',
      timestamp: new Date().toISOString(),
      seedInfo,
      database: currentDbStatus,
      ...result
    });
  } catch (err) {
    console.error('[Vercel Cron Error]:', err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
