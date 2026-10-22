/**
 * Vercel Serverless Function: /api/seed
 * Populates MongoDB Atlas with the complete 35 institutional financial articles.
 */

const mongodb = require('../lib/mongodb.js');
const { ArticlesData } = require('../js/articles-data.js');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'application/json');

  try {
    if (!mongodb.isMongoConfigured()) {
      return res.status(200).json({
        success: false,
        configured: false,
        message: 'MONGODB_URI is not set in environment variables on Vercel.',
        actionRequired: 'Add MONGODB_URI to your Vercel Project Settings > Environment Variables.'
      });
    }

    const itemsToSeed = (ArticlesData && ArticlesData.length > 0) ? ArticlesData : [];
    const seedResult = await mongodb.seedInitialArticles(itemsToSeed);
    const dbStatus = await mongodb.getDbStatus();

    return res.status(200).json({
      success: seedResult.success === true,
      message: seedResult.success
        ? 'MongoDB Atlas seeded successfully!'
        : ('Seeding status: ' + (seedResult.reason || seedResult.error || 'Check details')),
      configured: true,
      connected: dbStatus.connected === true,
      database: dbStatus.database,
      articlesInDatabase: dbStatus.articleCount || 0,
      details: seedResult
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
