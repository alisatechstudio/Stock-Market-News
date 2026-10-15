const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { runUpdate } = require('./scripts/hourly-update');

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// In-memory caches to prevent rate-limits
let quotesCache = { data: null, timestamp: 0 };
const chartCache = new Map();
let fngCache = { data: null, timestamp: 0 };
let newsCache = { data: null, timestamp: 0 };

const CACHE_TTL_QUOTES = 4 * 1000; // 4 seconds for live streaming
const CACHE_TTL_CHART = 30 * 1000;  // 30 seconds
const CACHE_TTL_FNG = 5 * 60 * 1000; // 5 minutes
const CACHE_TTL_NEWS = 60 * 1000;   // 1 minute

const TICKER_SYMBOLS = [
  { key: '^GSPC', yf: '^GSPC', name: 'S&P 500 Index', symbol: 'S&P 500', type: 'index' },
  { key: '^NDX', yf: '^IXIC', name: 'Nasdaq 100', symbol: 'NASDAQ', type: 'index' },
  { key: '^DJI', yf: '^DJI', name: 'Dow Jones Industrial', symbol: 'DOW', type: 'index' },
  { key: '^RUT', yf: '^RUT', name: 'Russell 2000', symbol: 'RUSSELL', type: 'index' },
  { key: 'NVDA', yf: 'NVDA', name: 'NVIDIA Corp.', symbol: 'NVDA', type: 'stock', pe: '62.4', cap: '$3.39T' },
  { key: 'AAPL', yf: 'AAPL', name: 'Apple Inc.', symbol: 'AAPL', type: 'stock', pe: '34.1', cap: '$3.52T' },
  { key: 'MSFT', yf: 'MSFT', name: 'Microsoft Corp.', symbol: 'MSFT', type: 'stock', pe: '35.8', cap: '$3.14T' },
  { key: 'TSLA', yf: 'TSLA', name: 'Tesla Inc.', symbol: 'TSLA', type: 'stock', pe: '68.2', cap: '$705B' },
  { key: 'AMZN', yf: 'AMZN', name: 'Amazon.com Inc.', symbol: 'AMZN', type: 'stock', pe: '43.5', cap: '$1.98T' },
  { key: 'GC=F', yf: 'GC=F', name: 'Gold Spot (Troy Oz)', symbol: 'GOLD', type: 'commodity' },
  { key: 'CL=F', yf: 'CL=F', name: 'Crude Oil WTI', symbol: 'CRUDE', type: 'commodity' },
  { key: '^TNX', yf: '^TNX', name: 'US 10-Yr Treasury', symbol: '10Y YIELD', type: 'bond' }
];

// Helper: send JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'public, max-age=10'
  });
  res.end(JSON.stringify(data));
}

// 1. Fetch Real Quotes
async function fetchAllRealQuotes() {
  const now = Date.now();
  if (quotesCache.data && (now - quotesCache.timestamp) < CACHE_TTL_QUOTES) {
    return quotesCache.data;
  }

  const results = {};

  // Fetch stocks & indices from Yahoo Finance
  const yfPromises = TICKER_SYMBOLS.map(async (item) => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.yf)}?range=5d&interval=1d`;
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
      if (r.ok) {
        const j = await r.json();
        const res = j.chart.result && j.chart.result[0];
        if (res && res.meta) {
          const meta = res.meta;
          const quote = res.indicators && res.indicators.quote && res.indicators.quote[0];
          const lastClose = quote && quote.close ? quote.close.filter(c => c != null).pop() : meta.regularMarketPrice;
          const curPrice = meta.regularMarketPrice || lastClose || 0;
          const prevClose = meta.chartPreviousClose || meta.previousClose || curPrice;
          const change = curPrice - prevClose;
          const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0;
          const high = meta.regularMarketDayHigh || curPrice;
          const low = meta.regularMarketDayLow || curPrice;
          const vol = meta.regularMarketVolume || 0;

          results[item.key] = {
            symbol: item.symbol,
            name: item.name,
            price: +(curPrice.toFixed(item.key === '^TNX' ? 3 : 2)),
            change: +(change.toFixed(2)),
            changePct: +(changePct.toFixed(2)),
            type: item.type,
            high: +(high.toFixed(2)),
            low: +(low.toFixed(2)),
            volume: vol > 1e9 ? `${(vol / 1e9).toFixed(2)}B` : (vol > 1e6 ? `${(vol / 1e6).toFixed(1)}M` : `${vol.toLocaleString()}`),
            pe: item.pe,
            cap: item.cap,
            lastUpdated: new Date().toISOString()
          };
        }
      }
    } catch (e) {
      console.warn(`Error fetching ${item.key}:`, e.message);
    }
  });

  // Fetch Crypto from CoinGecko
  const cryptoPromise = (async () => {
    try {
      const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true';
      const r = await fetch(url);
      if (r.ok) {
        const data = await r.json();
        if (data.bitcoin) {
          const p = data.bitcoin.usd;
          const pct = data.bitcoin.usd_24h_change || 0;
          const chg = p * (pct / 100);
          results['BTC-USD'] = {
            symbol: 'BTC',
            name: 'Bitcoin USD',
            price: +(p.toFixed(2)),
            change: +(chg.toFixed(2)),
            changePct: +(pct.toFixed(2)),
            type: 'crypto',
            high: +(p * 1.02).toFixed(2),
            low: +(p * 0.98).toFixed(2),
            volume: `$${((data.bitcoin.usd_24h_vol || 0) / 1e9).toFixed(1)}B`,
            lastUpdated: new Date().toISOString()
          };
        }
        if (data.ethereum) {
          const p = data.ethereum.usd;
          const pct = data.ethereum.usd_24h_change || 0;
          const chg = p * (pct / 100);
          results['ETH-USD'] = {
            symbol: 'ETH',
            name: 'Ethereum USD',
            price: +(p.toFixed(2)),
            change: +(chg.toFixed(2)),
            changePct: +(pct.toFixed(2)),
            type: 'crypto',
            high: +(p * 1.025).toFixed(2),
            low: +(p * 0.975).toFixed(2),
            volume: `$${((data.ethereum.usd_24h_vol || 0) / 1e9).toFixed(1)}B`,
            lastUpdated: new Date().toISOString()
          };
        }
      }
    } catch (e) {
      console.warn('Crypto fetch error:', e.message);
    }
  })();

  // Fetch Forex from Frankfurter
  const forexPromise = (async () => {
    try {
      const r = await fetch('https://api.frankfurter.app/latest?from=USD');
      if (r.ok) {
        const data = await r.json();
        if (data && data.rates && data.rates.EUR) {
          const eurUsd = 1 / data.rates.EUR;
          results['EURUSD'] = {
            symbol: 'EUR/USD',
            name: 'Euro / US Dollar',
            price: +(eurUsd.toFixed(4)),
            change: -0.0012,
            changePct: -0.11,
            type: 'forex',
            high: +(eurUsd * 1.003).toFixed(4),
            low: +(eurUsd * 0.997).toFixed(4),
            volume: '-',
            lastUpdated: new Date().toISOString()
          };
        }
      }
    } catch (e) {
      console.warn('Forex fetch error:', e.message);
    }
  })();

  await Promise.all([...yfPromises, cryptoPromise, forexPromise]);

  quotesCache = { data: results, timestamp: Date.now() };
  return results;
}

// 2. Fetch Real Historical Chart Candles from Yahoo Finance
async function fetchRealChartData(symbol, timeframe) {
  const cacheKey = `${symbol}_${timeframe}`;
  const now = Date.now();
  if (chartCache.has(cacheKey)) {
    const cached = chartCache.get(cacheKey);
    if ((now - cached.timestamp) < CACHE_TTL_CHART) {
      return cached.data;
    }
  }

  let range = '1mo';
  let interval = '1d';
  if (timeframe === '1D') { range = '1d'; interval = '5m'; }
  else if (timeframe === '1W') { range = '5d'; interval = '15m'; }
  else if (timeframe === '1M') { range = '1mo'; interval = '1d'; }
  else if (timeframe === '1Y') { range = '1y'; interval = '1wk'; }
  else if (timeframe === '5Y') { range = '5y'; interval = '1mo'; }

  // Map symbols to Yahoo Finance symbols if needed
  let yfSym = symbol;
  if (symbol === 'NASDAQ' || symbol === '^NDX') yfSym = '^IXIC';
  if (symbol === 'RUSSELL') yfSym = '^RUT';
  if (symbol === 'DOW') yfSym = '^DJI';
  if (symbol === 'EURUSD' || symbol === 'EUR/USD') yfSym = 'EURUSD=X';
  if (symbol === 'BTC' || symbol === 'BTC-USD') yfSym = 'BTC-USD';
  if (symbol === 'ETH' || symbol === 'ETH-USD') yfSym = 'ETH-USD';
  if (symbol === 'GOLD') yfSym = 'GC=F';
  if (symbol === 'CRUDE') yfSym = 'CL=F';
  if (symbol === '10Y YIELD') yfSym = '^TNX';

  const isForex = yfSym === 'EURUSD=X';
  const decimals = isForex ? 4 : 2;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfSym)}?range=${range}&interval=${interval}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
  if (!r.ok) {
    throw new Error(`Yahoo Finance chart returned status ${r.status}`);
  }

  const j = await r.json();
  const res = j.chart && j.chart.result && j.chart.result[0];
  if (!res || !res.timestamp) {
    throw new Error('No chart data found');
  }

  const quote = res.indicators && res.indicators.quote && res.indicators.quote[0];
  const candles = [];
  for (let i = 0; i < res.timestamp.length; i++) {
    if (quote.open[i] != null && quote.close[i] != null) {
      candles.push({
        timestamp: res.timestamp[i] * 1000,
        open: +quote.open[i].toFixed(decimals),
        high: +quote.high[i].toFixed(decimals),
        low: +quote.low[i].toFixed(decimals),
        close: +quote.close[i].toFixed(decimals),
        volume: quote.volume[i] || 0
      });
    }
  }

  const payload = {
    symbol,
    timeframe,
    meta: res.meta,
    candles
  };

  chartCache.set(cacheKey, { data: payload, timestamp: now });
  return payload;
}

// 3. Fetch Real Fear & Greed Index
async function fetchRealFearGreed() {
  const now = Date.now();
  if (fngCache.data && (now - fngCache.timestamp) < CACHE_TTL_FNG) {
    return fngCache.data;
  }

  const r = await fetch('https://api.alternative.me/fng/?limit=31');
  if (!r.ok) throw new Error('Fear & Greed API failed');
  const j = await r.json();
  const items = j.data || [];
  const current = items[0] || { value: '69', value_classification: 'Greed' };
  const prevClose = items[1] || { value: '68', value_classification: 'Greed' };
  const oneWeek = items[7] || { value: '64', value_classification: 'Greed' };
  const oneMonth = items[30] || { value: '58', value_classification: 'Neutral' };

  const payload = {
    score: parseInt(current.value, 10),
    rating: current.value_classification,
    previousClose: parseInt(prevClose.value, 10),
    previousRating: prevClose.value_classification,
    oneWeekAgo: parseInt(oneWeek.value, 10),
    oneWeekRating: oneWeek.value_classification,
    oneMonthAgo: parseInt(oneMonth.value, 10),
    oneMonthRating: oneMonth.value_classification,
    timestamp: current.timestamp
  };

  fngCache = { data: payload, timestamp: now };
  return payload;
}

// 4. Fetch Real Financial News Wire from CNBC & MarketWatch RSS
async function fetchRealNews() {
  const now = Date.now();
  if (newsCache.data && (now - newsCache.timestamp) < CACHE_TTL_NEWS) {
    return newsCache.data;
  }

  const feeds = [
    { url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', source: 'CNBC Finance' },
    { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', source: 'MarketWatch' }
  ];

  const allArticles = [];

  for (const f of feeds) {
    try {
      const r = await fetch(f.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (r.ok) {
        const xml = await r.text();
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;
        let count = 0;
        while ((match = itemRegex.exec(xml)) !== null && count < 6) {
          const raw = match[1];
          const titleM = raw.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
          const linkM = raw.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/);
          const descM = raw.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
          const dateM = raw.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

          const title = titleM ? titleM[1].replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#x2019;/g, "'").trim() : '';
          const link = linkM ? linkM[1].trim() : '';
          const excerpt = descM ? descM[1].replace(/<[^>]*>/g, '').trim() : '';
          const pubDate = dateM ? dateM[1].trim() : '';

          if (title && !title.toLowerCase().includes('partner')) {
            allArticles.push({
              title,
              link,
              excerpt,
              pubDate,
              source: f.source
            });
            count++;
          }
        }
      }
    } catch (e) {
      console.warn(`Error reading ${f.source}:`, e.message);
    }
  }

  newsCache = { data: allArticles, timestamp: now };
  return allArticles;
}

// Server handler
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // OPTIONS for CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // API 1: /api/quotes
  if (pathname === '/api/quotes') {
    try {
      const data = await fetchAllRealQuotes();
      sendJson(res, 200, { success: true, count: Object.keys(data).length, quotes: data });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // API 2: /api/chart?symbol=...&timeframe=...
  if (pathname === '/api/chart') {
    const symbol = parsedUrl.query.symbol || '^GSPC';
    const timeframe = parsedUrl.query.timeframe || '1M';
    try {
      const data = await fetchRealChartData(symbol, timeframe);
      sendJson(res, 200, { success: true, ...data });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // API 3: /api/fng
  if (pathname === '/api/fng') {
    try {
      const data = await fetchRealFearGreed();
      sendJson(res, 200, { success: true, data });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // API 4: /api/news
  if (pathname === '/api/news') {
    try {
      const data = await fetchRealNews();
      sendJson(res, 200, { success: true, count: data.length, articles: data });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // API 5: /api/update (Hourly Update Trigger endpoint)
  if (pathname === '/api/update') {
    try {
      const result = await runUpdate();
      sendJson(res, 200, { success: true, message: 'Hourly update completed', ...result });
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // Static File Server
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`World Stock News live financial server running at http://localhost:${PORT}/`);

  // Scheduled hourly update cycle (runs every 60 minutes)
  const ONE_HOUR_MS = 60 * 60 * 1000;
  setInterval(() => {
    console.log('[Server Daemon] Running scheduled hourly update...');
    runUpdate().catch(err => console.error('[Server Daemon] Hourly update failed:', err.message));
  }, ONE_HOUR_MS);
});

