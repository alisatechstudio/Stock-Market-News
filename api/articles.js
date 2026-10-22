/**
 * Vercel Serverless Function: /api/articles
 * Returns financial intelligence articles from MongoDB Atlas (with bundled static fallback).
 */

const mongodb = require('../lib/mongodb.js');
const { ArticlesData } = require('../js/articles-data.js');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
  res.setHeader('Content-Type', 'application/json');

  const limit = Math.min(parseInt(req.query.limit, 10) || 35, 100);
  const category = req.query.category || null;
  const skip = parseInt(req.query.skip, 10) || 0;

  try {
    if (mongodb.isMongoConfigured()) {
      const dbArticles = await mongodb.getArticles({ limit, category, skip });
      if (Array.isArray(dbArticles) && dbArticles.length > 0) {
        return res.status(200).json({
          success: true,
          count: dbArticles.length,
          source: 'mongodb',
          articles: dbArticles
        });
      }
    }

    // Fallback to static articles
    let filtered = ArticlesData || [];
    if (category) {
      filtered = filtered.filter(a => a.categorySlug === category.toLowerCase().trim());
    }
    const sliced = filtered.slice(skip, skip + limit);
    return res.status(200).json({
      success: true,
      count: sliced.length,
      source: 'bundled-memory',
      articles: sliced
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
