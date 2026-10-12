/**
 * @alisatechstudio/stock-market-news
 * Main module entry point for Node.js environments
 */

const fs = require('fs');
const path = require('path');

// Read articles database
const articlesDataRaw = fs.readFileSync(path.join(__dirname, 'js', 'articles-data.js'), 'utf8');
// Safely evaluate or extract ArticlesData
let ArticlesData = [];
try {
  const sandbox = {};
  const fn = new Function('sandbox', `${articlesDataRaw}; return ArticlesData;`);
  ArticlesData = fn();
} catch (e) {
  console.warn("Could not load internal ArticlesData:", e.message);
}

module.exports = {
  name: "MarketPulse",
  version: "1.0.0",
  ArticlesData,
  getArticleById: (id) => ArticlesData.find(a => a.id === id),
  getTickersSummary: () => [
    { symbol: "^GSPC", name: "S&P 500" },
    { symbol: "^NDX", name: "Nasdaq 100" },
    { symbol: "^DJI", name: "Dow Jones Industrial" },
    { symbol: "NVDA", name: "NVIDIA Corp." },
    { symbol: "BTC-USD", name: "Bitcoin USD" },
    { symbol: "EURUSD", name: "EUR/USD Forex" }
  ]
};
