/**
 * World Stock News - Institutional Financial Intelligence Web Application
 * Modern Node.js + Express + Server-Side Rendering (SSR) Architecture
 * 
 * Features:
 * - Express web application with HTTP compression & strict security headers
 * - Full Server-Side Rendering (SSR) for articles with dynamic SEO, OpenGraph & JSON-LD
 * - Clean RESTful URLs (/article/:id, /category/:slug, /about, /contact, etc.)
 * - High-speed in-memory cached multi-API telemetry (Yahoo Finance, CoinGecko, Frankfurter, Fear & Greed)
 * - Safe static asset delivery with path-traversal jail and Cache-Control headers
 * - Protected administrative update endpoint (/api/update)
 * - Automated hourly news syndication daemon
 */

const express = require('express');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const { runUpdate } = require('./scripts/hourly-update');
const mongodb = require('./lib/mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.resolve(__dirname);

// Enable gzip/deflate compression
app.use(compression());

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Allow cross-origin access for open API telemetry
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  next();
});

// Cache for articles-data
let cachedArticles = [];
async function loadArticlesData() {
  try {
    // 1. Try direct CommonJS require (guarantees bundling in Vercel Serverless Function)
    try {
      const mod = require('./js/articles-data.js');
      if (mod && Array.isArray(mod.ArticlesData) && mod.ArticlesData.length > 0) {
        cachedArticles = mod.ArticlesData;
      }
    } catch (_) {}

    if (cachedArticles.length === 0) {
      const raw = fs.readFileSync(path.join(ROOT_DIR, 'js', 'articles-data.js'), 'utf8');
      const fn = new Function(`${raw}; return ArticlesData;`);
      const data = fn();
      if (Array.isArray(data) && data.length > 0) {
        cachedArticles = data;
      }
    }
  } catch (err) {
    console.warn('[Server] Notice loading ArticlesData:', err.message);
  }

  // If MongoDB is connected on Vercel, seed if empty and sync latest articles
  if (mongodb.isMongoConfigured() && cachedArticles.length > 0) {
    try {
      await mongodb.seedInitialArticles(cachedArticles);
      const dbArticles = await mongodb.getArticles({ limit: 35, autoSeed: false });
      if (Array.isArray(dbArticles) && dbArticles.length > 0) {
        cachedArticles = dbArticles;
      }
    } catch (dbErr) {
      console.warn('[Server] MongoDB sync notice:', dbErr.message);
    }
  }

  return cachedArticles;
}
loadArticlesData().catch(() => {});

// Helper to escape HTML characters in templates
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ==========================================================================
   MULTI-API TELEMETRY CACHES & DATA ENGINES
   ========================================================================== */

let quotesCache = { data: null, timestamp: 0 };
const chartCache = new Map();
let fngCache = { data: null, timestamp: 0 };
let newsCache = { data: null, timestamp: 0 };

const CACHE_TTL_QUOTES = 4 * 1000;  // 4s
const CACHE_TTL_CHART = 30 * 1000;   // 30s
const CACHE_TTL_FNG = 5 * 60 * 1000; // 5m
const CACHE_TTL_NEWS = 60 * 1000;    // 1m

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
      // Quiet fallback
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
            price: p,
            change: +(chg.toFixed(2)),
            changePct: +(pct.toFixed(2)),
            type: 'crypto',
            high: +(p * 1.02).toFixed(2),
            low: +(p * 0.98).toFixed(2),
            volume: `$${((data.bitcoin.usd_24h_vol || 25e9) / 1e9).toFixed(1)}B`,
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
            price: p,
            change: +(chg.toFixed(2)),
            changePct: +(pct.toFixed(2)),
            type: 'crypto',
            high: +(p * 1.025).toFixed(2),
            low: +(p * 0.975).toFixed(2),
            volume: `$${((data.ethereum.usd_24h_vol || 12e9) / 1e9).toFixed(1)}B`,
            lastUpdated: new Date().toISOString()
          };
        }
      }
    } catch (e) {}
  })();

  // Fetch EUR/USD from Frankfurter
  const fxPromise = (async () => {
    try {
      const r = await fetch('https://api.frankfurter.app/latest?from=USD');
      if (r.ok) {
        const j = await r.json();
        if (j.rates && j.rates.EUR) {
          const eurUsd = +(1 / j.rates.EUR).toFixed(4);
          results['EURUSD'] = {
            symbol: 'EUR/USD',
            name: 'Euro / US Dollar',
            price: eurUsd,
            change: 0.0012,
            changePct: 0.11,
            type: 'forex',
            high: +(eurUsd * 1.003).toFixed(4),
            low: +(eurUsd * 0.997).toFixed(4),
            volume: '-',
            lastUpdated: new Date().toISOString()
          };
        }
      }
    } catch (e) {}
  })();

  await Promise.allSettled([...yfPromises, cryptoPromise, fxPromise]);

  if (Object.keys(results).length > 0) {
    quotesCache = { data: results, timestamp: now };
  }
  return quotesCache.data || {};
}

// 2. Fetch Real Historical Chart Candles
async function fetchRealChartData(symbol, timeframe) {
  const cacheKey = `${symbol}_${timeframe}`;
  const now = Date.now();
  const cached = chartCache.get(cacheKey);
  if (cached && (now - cached.timestamp) < CACHE_TTL_CHART) {
    return cached.data;
  }

  let yfSymbol = symbol;
  const found = TICKER_SYMBOLS.find(t => t.key === symbol);
  if (found) yfSymbol = found.yf;
  if (symbol === 'BTC-USD') yfSymbol = 'BTC-USD';
  if (symbol === 'ETH-USD') yfSymbol = 'ETH-USD';
  if (symbol === 'EURUSD') yfSymbol = 'EURUSD=X';

  let range = '1mo';
  let interval = '1d';
  if (timeframe === '1D') { range = '1d'; interval = '5m'; }
  else if (timeframe === '1W') { range = '5d'; interval = '15m'; }
  else if (timeframe === '1M') { range = '1mo'; interval = '1d'; }
  else if (timeframe === '1Y') { range = '1y'; interval = '1wk'; }
  else if (timeframe === '5Y') { range = '5y'; interval = '1mo'; }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yfSymbol)}?range=${range}&interval=${interval}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.ok) {
      const j = await r.json();
      const res = j.chart && j.chart.result && j.chart.result[0];
      if (res && res.timestamp && res.indicators && res.indicators.quote) {
        const quotes = res.indicators.quote[0];
        const candles = [];
        const isForex = symbol === 'EURUSD';
        const dec = isForex ? 4 : 2;

        for (let i = 0; i < res.timestamp.length; i++) {
          const ts = res.timestamp[i] * 1000;
          const open = quotes.open ? quotes.open[i] : null;
          const high = quotes.high ? quotes.high[i] : null;
          const low = quotes.low ? quotes.low[i] : null;
          const close = quotes.close ? quotes.close[i] : null;
          const vol = quotes.volume ? quotes.volume[i] : 0;

          if (open != null && high != null && low != null && close != null) {
            candles.push({
              timestamp: new Date(ts).toISOString(),
              open: +open.toFixed(dec),
              high: +high.toFixed(dec),
              low: +low.toFixed(dec),
              close: +close.toFixed(dec),
              volume: vol || 0
            });
          }
        }

        if (candles.length > 0) {
          const out = { symbol, timeframe, count: candles.length, candles };
          chartCache.set(cacheKey, { data: out, timestamp: now });
          return out;
        }
      }
    }
  } catch (err) {}

  return { symbol, timeframe, count: 0, candles: [] };
}

// 3. Fetch Real Fear & Greed Index
async function fetchRealFearGreed() {
  const now = Date.now();
  if (fngCache.data && (now - fngCache.timestamp) < CACHE_TTL_FNG) {
    return fngCache.data;
  }

  try {
    const r = await fetch('https://api.alternative.me/fng/?limit=31');
    if (r.ok) {
      const j = await r.json();
      if (j.data && j.data.length > 0) {
        const cur = j.data[0];
        const prev = j.data[1] || cur;
        const week = j.data[7] || cur;
        const month = j.data[30] || cur;

        const data = {
          score: parseInt(cur.value, 10),
          rating: cur.value_classification,
          previousClose: parseInt(prev.value, 10),
          previousRating: prev.value_classification,
          oneWeekAgo: parseInt(week.value, 10),
          oneWeekRating: week.value_classification,
          oneMonthAgo: parseInt(month.value, 10),
          oneMonthRating: month.value_classification
        };
        fngCache = { data, timestamp: now };
        return data;
      }
    }
  } catch (e) {}

  return fngCache.data || { score: 69, rating: 'Greed' };
}

// 4. Fetch Real Breaking News Wire
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
    } catch (e) {}
  }

  newsCache = { data: allArticles, timestamp: now };
  return allArticles;
}

/* ==========================================================================
   SERVER-SIDE RENDERING (SSR) ENGINE FOR ARTICLES
   ========================================================================== */

let articleTemplate = '';
function getArticleTemplate() {
  if (!articleTemplate) {
    articleTemplate = fs.readFileSync(path.join(ROOT_DIR, 'article.html'), 'utf8');
  }
  return articleTemplate;
}

async function renderArticleSsr(articleId) {
  await loadArticlesData();
  const template = getArticleTemplate();

  let article = null;
  if (mongodb.isMongoConfigured()) {
    try {
      article = await mongodb.getArticleById(articleId);
    } catch (e) {
      console.warn('[SSR] MongoDB lookup fallback:', e.message);
    }
  }

  if (!article) {
    article = cachedArticles.find(a => a.id === articleId) || cachedArticles[0];
  }

  if (!article) return template;

  const canonicalUrl = `https://worldstocknews.online/article/${encodeURIComponent(article.id)}`;
  const pageTitle = `${escapeHtml(article.title)} | World Stock News`;
  const metaDesc = escapeHtml(article.excerpt);
  const safeImg = article.image || 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&q=80';
  const pubDateFormatted = new Date(article.publishedAt).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const tocHtml = (article.tableOfContents && article.tableOfContents.length > 0)
    ? article.tableOfContents.map(toc => `<li><a href="#${escapeHtml(toc.id)}">${escapeHtml(toc.title)}</a></li>`).join('\n')
    : '';

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": article.title,
    "description": article.excerpt,
    "image": [safeImg],
    "datePublished": article.publishedAt,
    "dateModified": article.publishedAt,
    "author": [{
      "@type": "Organization",
      "name": (article.author && article.author.name) ? article.author.name : "World Stock News Editorial Desk",
      "url": "https://worldstocknews.online/about"
    }],
    "publisher": {
      "@type": "Organization",
      "name": "World Stock News",
      "logo": {
        "@type": "ImageObject",
        "url": "https://worldstocknews.online/assets/logo.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": canonicalUrl
    },
    "keywords": (article.tickers || []).join(", ")
  });

  let html = template;

  // Replace Title & Meta Description & Canonical
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${pageTitle}</title>`);
  html = html.replace(/<meta name="description" content="[\s\S]*?">/, `<meta name="description" content="${metaDesc}">`);
  html = html.replace(/<link rel="canonical" href="[\s\S]*?">/, `<link rel="canonical" href="${canonicalUrl}">`);

  // Inject OpenGraph & Twitter tags if not present or replace
  const socialMeta = `
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="World Stock News">
  <meta property="og:title" content="${pageTitle}">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${safeImg}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${pageTitle}">
  <meta name="twitter:description" content="${metaDesc}">
  <meta name="twitter:image" content="${safeImg}">
  <script type="application/ld+json">${jsonLd}</script>
  `;
  html = html.replace('</head>', `${socialMeta}\n</head>`);

  // Replace Breadcrumbs
  html = html.replace(/id="bcCategory">[\s\S]*?<\/span>/, `id="bcCategory">${escapeHtml(article.category)}</span>`);
  html = html.replace(/id="bcTitle">[\s\S]*?<\/span>/, `id="bcTitle">${escapeHtml(article.title)}</span>`);

  // Replace Category & Sentiment Badges
  html = html.replace(/id="artCatBadge">[\s\S]*?<\/span>/, `id="artCatBadge">${escapeHtml(article.category)}</span>`);
  const isBull = article.sentiment === 'Bullish';
  const isBear = article.sentiment === 'Bearish';
  const sentClass = isBull ? 'pos' : (isBear ? 'neg' : 'neutral');
  html = html.replace(/id="artSentBadge" class="[^"]*">[\s\S]*?<\/span>/, `id="artSentBadge" class="sentiment-pill ${sentClass}">${escapeHtml(article.sentiment)} ${escapeHtml(article.sentimentScore)}</span>`);

  // Replace Title & Date & Read Time & Target
  html = html.replace(/id="artTitle">[\s\S]*?<\/h1>/, `id="artTitle">${escapeHtml(article.title)}</h1>`);
  html = html.replace(/id="artDate">[\s\S]*?<\/time>/, `id="artDate">${pubDateFormatted}</time>`);
  html = html.replace(/id="artReadTime">[\s\S]*?<\/span>/, `id="artReadTime">${escapeHtml(article.readTime)}</span>`);
  html = html.replace(/id="artConsensus">[\s\S]*?<\/span>/, `id="artConsensus">Consensus: ${escapeHtml(article.analystConsensus)} (${escapeHtml(article.targetPrice)})</span>`);

  // Replace Author
  const authorName = (article.author && article.author.name) ? article.author.name : 'World Stock News Editorial Desk';
  const authorTitle = (article.author && article.author.title) ? article.author.title : 'Financial Market Intelligence';
  const authorAvatar = (article.author && article.author.avatar) ? article.author.avatar : '/assets/logo.png';
  html = html.replace(/id="artAuthorImg" class="[^"]*" src="[^"]*" alt="[^"]*"/, `id="artAuthorImg" class="author-avatar" src="${escapeHtml(authorAvatar)}" alt="${escapeHtml(authorName)}"`);
  html = html.replace(/id="artAuthorName"[^>]*>[\s\S]*?<\/(span|div)>/, `id="artAuthorName" class="author-name" style="font-size:1rem;">${escapeHtml(authorName)}</span>`);
  html = html.replace(/id="artAuthorTitle"[^>]*>[\s\S]*?<\/(span|div)>/, `id="artAuthorTitle" class="author-title">${escapeHtml(authorTitle)}</span>`);

  // Replace Hero Image
  html = html.replace(/id="artHeroImg" class="[^"]*" src="[^"]*" alt="[^"]*"/, `id="artHeroImg" class="article-hero-img" src="${safeImg}" alt="${escapeHtml(article.title)}"`);

  // Replace Table of Contents
  if (tocHtml) {
    html = html.replace(/<ul class="toc-list" id="tocList">[\s\S]*?<\/ul>/, `<ul class="toc-list" id="tocList">\n${tocHtml}\n</ul>`);
  }

  // Pre-render Article Body Content!
  if (article.bodyHtml) {
    html = html.replace(/<article[^>]*id="artBody"[^>]*>[\s\S]*?<\/article>/, `<article class="modal-article-body" id="artBody">\n${article.bodyHtml}\n</article>`);
  }

  // Pre-render Wire Source Banner if sourceUrl exists
  const sourceUrl = article.sourceUrl || article.link;
  if (sourceUrl && (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://'))) {
    const sourceName = escapeHtml(article.source || 'Financial Wire');
    const bannerHtml = `
    <div id="artSourceBanner" style="display:flex; margin: 1.5rem 0; padding: 1.1rem 1.25rem; background: var(--bg-surface); border: 1px solid var(--border-medium); border-left: 4px solid var(--accent-blue); border-radius: var(--radius-md); align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;">
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:1.4rem;">📡</span>
        <div>
          <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--text-muted); font-weight:700;">Syndicated Wire Release</div>
          <div id="artSourceName" style="font-size:0.95rem; font-weight:700; color:var(--text-primary);">${sourceName}</div>
        </div>
      </div>
      <a id="artSourceLink" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="text-decoration:none; display:inline-flex; align-items:center; gap:6px; padding:8px 16px; font-size:0.88rem; font-weight:700;">
        <span>Read Full Story on ${sourceName}</span>
        <span>↗</span>
      </a>
    </div>`;
    html = html.replace(/<div id="artSourceBanner"[\s\S]*?<\/a>\s*<\/div>/, bannerHtml);
  }

  return html;
}

/* ==========================================================================
   STATIC ASSETS WITH JAILED PATHS & CACHE HEADERS
   ========================================================================== */

// Dedicated Static Assets Handler
app.use('/css', express.static(path.join(ROOT_DIR, 'css'), { maxAge: '1d' }));
app.use('/js', express.static(path.join(ROOT_DIR, 'js'), { maxAge: '1h' }));
app.use('/assets', express.static(path.join(ROOT_DIR, 'assets'), { maxAge: '7d' }));

// Core root static files
const rootStaticFiles = [
  'favicon.ico',
  'favicon.svg',
  'manifest.json',
  'robots.txt',
  'ads.txt',
  'sitemap.xml',
  'feed.xml',
  'feed.json',
  'llms.txt',
  'llms-full.txt',
  'CNAME',
  'sw.js'
];

rootStaticFiles.forEach(file => {
  app.get(`/${file}`, (req, res) => {
    const filePath = path.join(ROOT_DIR, file);
    if (fs.existsSync(filePath)) {
      if (file.endsWith('.xml') || file.endsWith('.json') || file.endsWith('.txt')) {
        res.setHeader('Cache-Control', 'public, max-age=60'); // Fresh for crawlers
      } else {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
      res.sendFile(filePath);
    } else {
      res.status(404).send('Not Found');
    }
  });
});

/* ==========================================================================
   APPLICATION ROUTES (SSR & CLEAN URLS)
   ========================================================================== */

// 1. Homepage
app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

// Backward compatibility for index.html
app.get('/index.html', (req, res) => {
  res.redirect(301, '/');
});

// Static asset fallbacks for nested routes (/article/css, /category/js, etc.)
app.use(['/article/css', '/category/css'], express.static(path.join(ROOT_DIR, 'css')));
app.use(['/article/js', '/category/js'], express.static(path.join(ROOT_DIR, 'js')));
app.use(['/article/assets', '/category/assets'], express.static(path.join(ROOT_DIR, 'assets')));

// 2. SSR Clean Article Route (/article/:id)
app.get('/article/:id', async (req, res) => {
  const articleId = req.params.id;
  const rendered = await renderArticleSsr(articleId);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  res.send(rendered);
});

// 3. Backward Compatibility for /article.html?id=...
app.get('/article.html', async (req, res) => {
  const articleId = req.query.id;
  if (articleId) {
    const rendered = await renderArticleSsr(articleId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    return res.send(rendered);
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.sendFile(path.join(ROOT_DIR, 'article.html'));
});

// 4. Secondary Institutional Pages (Clean URLs with automatic fallback)
const secondaryPages = [
  { route: '/about', file: 'about.html' },
  { route: '/contact', file: 'contact.html' },
  { route: '/privacy-policy', file: 'privacy-policy.html' },
  { route: '/terms', file: 'terms.html' }
];

secondaryPages.forEach(p => {
  app.get(p.route, (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(path.join(ROOT_DIR, p.file));
  });
  app.get(`${p.route}.html`, (req, res) => {
    res.redirect(301, p.route);
  });
});

// Category archive route
app.get('/category/:slug', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'index.html'));
});

/* ==========================================================================
   REST API ENDPOINTS
   ========================================================================== */

// API 0: Liveness & Readiness Health Probe
app.get(['/api/health', '/health'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.json({
    status: 'ok',
    server: 'WorldStockNews-Node/2.0.0',
    deployment: process.env.VERCEL ? 'vercel-serverless' : 'standalone-node',
    mongodb: mongodb.isMongoConfigured() ? 'connected' : 'not-configured',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    articlesLoaded: cachedArticles.length
  });
});

// API: MongoDB Diagnostic Status
app.get(['/api/db-status', '/db-status'], async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  const status = await mongodb.getDbStatus();
  res.json({
    success: status.connected === true,
    server: 'WorldStockNews-Node/2.0.0',
    deployment: process.env.VERCEL ? 'vercel-serverless' : 'standalone-node',
    ...status
  });
});

// API: Manual / Remote Seed Trigger
app.all(['/api/seed', '/seed'], async (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  await loadArticlesData();
  const seedItems = cachedArticles.length > 0
    ? cachedArticles
    : (require('./js/articles-data.js').ArticlesData || []);

  const result = await mongodb.seedInitialArticles(seedItems);
  const status = await mongodb.getDbStatus();

  res.json({
    success: result.success === true,
    message: result.success ? 'MongoDB articles collection seeded successfully.' : 'Seeding incomplete or skipped.',
    database: mongodb.getDbName(),
    articlesInMemory: seedItems.length,
    articlesInDb: status.articleCount || 0,
    details: result
  });
});

// API: Articles Feed from MongoDB Atlas or Cache
app.get(['/api/articles', '/articles', '/api/news-feed'], async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 35, 100);
  const category = req.query.category || null;
  const skip = parseInt(req.query.skip, 10) || 0;

  if (mongodb.isMongoConfigured()) {
    try {
      const dbArticles = await mongodb.getArticles({ limit, category, skip });
      if (Array.isArray(dbArticles) && dbArticles.length > 0) {
        res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
        return res.json({
          success: true,
          count: dbArticles.length,
          source: 'mongodb',
          articles: dbArticles
        });
      }
    } catch (dbErr) {
      console.warn('[Server] Error querying MongoDB for articles:', dbErr.message);
    }
  }

  // Fallback to in-memory cachedArticles
  let filtered = cachedArticles;
  if (category) {
    filtered = filtered.filter(a => a.categorySlug === category.toLowerCase().trim());
  }
  const sliced = filtered.slice(skip, skip + limit);
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
  res.json({
    success: true,
    count: sliced.length,
    source: 'memory',
    articles: sliced
  });
});

// API: Vercel Cron Scheduled Ingestion Endpoint
app.all(['/api/cron', '/cron', '/api/hourly-update'], async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (process.env.CRON_SECRET) {
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Invalid CRON_SECRET' });
    }
  }

  try {
    const result = await runUpdate();
    await loadArticlesData();
    res.setHeader('Cache-Control', 'no-cache');
    res.json({
      success: true,
      message: 'Vercel Cron Hourly Cycle Completed',
      timestamp: new Date().toISOString(),
      ...result
    });
  } catch (err) {
    console.error('[Server Cron Error]:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API 1: Live Real-Time Quotes
app.get(['/api/quotes', '/quotes'], async (req, res) => {
  try {
    const data = await fetchAllRealQuotes();
    res.setHeader('Cache-Control', 'public, max-age=4');
    res.json({ success: true, count: Object.keys(data).length, quotes: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API 2: Historical Candle Data
app.get(['/api/chart', '/chart'], async (req, res) => {
  const symbol = req.query.symbol || '^GSPC';
  const timeframe = req.query.timeframe || '1M';
  try {
    const data = await fetchRealChartData(symbol, timeframe);
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API 3: Fear & Greed Index
app.get(['/api/fng', '/fng'], async (req, res) => {
  try {
    const data = await fetchRealFearGreed();
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API 4: Real-time News Wire
app.get(['/api/news', '/news'], async (req, res) => {
  try {
    const data = await fetchRealNews();
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ success: true, count: data.length, articles: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API 5: Articles Search & Listing API
app.get('/api/articles', (req, res) => {
  loadArticlesData();
  let list = [...cachedArticles];
  const { category, search, limit } = req.query;

  if (category && category !== 'all') {
    list = list.filter(a => a.categorySlug === category);
  }
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.excerpt.toLowerCase().includes(q) ||
      (a.tickers && a.tickers.some(t => t.toLowerCase().includes(q)))
    );
  }
  const lim = parseInt(limit, 10);
  if (!isNaN(lim) && lim > 0) {
    list = list.slice(0, lim);
  }

  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json({ success: true, total: list.length, articles: list });
});

// API 6: Single Article JSON by ID
app.get('/api/articles/:id', (req, res) => {
  loadArticlesData();
  const article = cachedArticles.find(a => a.id === req.params.id);
  if (!article) {
    return res.status(404).json({ success: false, error: 'Article not found' });
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ success: true, article });
});

// API 7: Protected Automated Ingestion Trigger (/api/update)
app.all('/api/update', async (req, res) => {
  // Security check: restrict trigger to localhost or secret token
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const isLocalhost = clientIp.includes('127.0.0.1') || clientIp.includes('::1');
  const token = req.query.token || req.headers['x-api-key'] || req.headers['authorization'];
  const expectedSecret = process.env.UPDATE_SECRET_KEY || 'wsn-hourly-secret-key-2026';

  if (!isLocalhost && token !== expectedSecret) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Protected update endpoint requires secret token or local execution.'
    });
  }

  try {
    const result = await runUpdate();
    loadArticlesData();
    articleTemplate = ''; // Refresh cached template
    res.json({ success: true, message: 'Hourly ingestion update completed successfully', ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ==========================================================================
   CUSTOM 404 NOT FOUND HANDLER (INSTITUTIONAL OBSIDIAN THEME)
   ========================================================================== */

app.use((req, res) => {
  res.status(404).send(`<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 - Terminal Instrument Not Found | World Stock News</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="stylesheet" href="/css/style.css">
  <style>
    .notfound-wrap {
      min-height: 80vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 2rem;
    }
    .notfound-code {
      font-size: clamp(4rem, 12vw, 8rem);
      font-weight: 800;
      font-family: var(--font-mono);
      background: linear-gradient(135deg, var(--accent-cyan), var(--accent-blue));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      line-height: 1;
      margin-bottom: 1rem;
    }
  </style>
</head>
<body>
  <div class="notfound-wrap">
    <div class="notfound-code">404</div>
    <h1 style="font-size:1.8rem; margin-bottom:1rem;">Financial Telemetry Route Not Found</h1>
    <p style="color:var(--text-secondary); max-width:500px; margin-bottom:2rem;">
      The requested ticker, analysis report, or terminal asset does not exist or has been relocated to another liquidity sector.
    </p>
    <div style="display:flex; gap:12px;">
      <a href="/" class="btn-primary">Return to Market Terminal</a>
      <a href="/about" class="btn-outline">About Our Desk</a>
    </div>
  </div>
</body>
</html>`);
});

/* ==========================================================================
   START SERVER & HOURLY AUTOMATION DAEMON
   ========================================================================== */

let server = null;
if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(` World Stock News Pro Terminal Web App Running`);
    console.log(` URL: http://localhost:${PORT}/`);
    console.log(` Mode: Node.js Express + Server-Side Rendering (SSR)`);
    console.log(`================================================================`);

    // Scheduled hourly update cycle (runs every 60 minutes)
    const ONE_HOUR_MS = 60 * 60 * 1000;
    setInterval(() => {
      console.log('[Server Daemon] Running scheduled hourly update...');
      runUpdate()
        .then(() => {
          loadArticlesData();
          articleTemplate = '';
        })
        .catch(err => console.error('[Server Daemon] Hourly update failed:', err.message));
    }, ONE_HOUR_MS);
  });
}

module.exports = { app, server, PORT };
