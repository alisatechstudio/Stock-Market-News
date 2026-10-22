/**
 * Vercel Serverless Function: /api/db-status
 * Diagnostics endpoint returning real-time MongoDB Atlas connection health & document counts.
 */

const mongodb = require('../lib/mongodb.js');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'application/json');

  try {
    const status = await mongodb.getDbStatus();
    return res.status(200).json({
      success: status.connected === true,
      timestamp: new Date().toISOString(),
      server: 'WorldStockNews-Vercel/2.0.0',
      ...status
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
};
