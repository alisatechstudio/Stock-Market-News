/**
 * Vercel Cron Ingestion Function
 * Automatically invoked hourly via Vercel Cron to fetch financial wires,
 * update MongoDB Atlas database, and refresh live feeds.
 */

const { runUpdate } = require('../scripts/hourly-update.js');

module.exports = async (req, res) => {
  // Verify Vercel Cron authorization if CRON_SECRET is set
  const authHeader = req.headers['authorization'];
  if (process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid CRON_SECRET' });
    }
  }

  try {
    const result = await runUpdate();
    res.setHeader('Cache-Control', 'no-cache');
    return res.status(200).json({
      success: true,
      message: 'Vercel Cron Ingestion Completed Successfully',
      timestamp: new Date().toISOString(),
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
