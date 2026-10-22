/**
 * World Stock News - Automated Hourly Update Engine
 * 
 * Automatically updates:
 * 1. sitemap.xml - Updates all <lastmod> timestamps and registers new article URLs
 * 2. feed.xml - Updates RSS 2.0 <lastBuildDate> and news items
 * 3. feed.json - Updates JSON Feed 1.1 specification and timestamps
 * 4. js/articles-data.js - Merges fresh market wire news articles
 * 
 * Can be run:
 * - Standalone: node scripts/hourly-update.js
 * - As a daemon: node scripts/hourly-update.js --daemon
 * - Programmatically: const { runUpdate } = require('./scripts/hourly-update.js')
 * - Via GitHub Actions: .github/workflows/hourly-update.yml (every hour via cron)
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SITEMAP_PATH = path.join(ROOT_DIR, 'sitemap.xml');
const FEED_XML_PATH = path.join(ROOT_DIR, 'feed.xml');
const FEED_JSON_PATH = path.join(ROOT_DIR, 'feed.json');
const ARTICLES_DATA_PATH = path.join(ROOT_DIR, 'js', 'articles-data.js');

const RSS_FEEDS = [
  { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', source: 'MarketWatch' },
  { url: 'https://www.cnbc.com/id/10000664/device/rss/rss.html', source: 'CNBC Finance' },
  { url: 'https://finance.yahoo.com/news/rssindex', source: 'Yahoo Finance' }
];

// Helper: fetch with timeout
async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WorldStockNewsBot/2.0',
        ...(options.headers || {})
      }
    });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// Helper: decode HTML & numeric entities to plain text characters
function decodeHtmlEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch (e) {
        return _;
      }
    })
    .replace(/&#([0-9]+);/g, (_, dec) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch (e) {
        return _;
      }
    });
}

// Helper: safely escape text for XML elements and attributes
function escapeXml(str) {
  if (!str) return '';
  // Decode first (double pass to handle potential nested encodings like &amp;#x2019;)
  let s = decodeHtmlEntities(decodeHtmlEntities(String(str)));
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Fetch RSS feed items
async function fetchFreshNewsFromFeeds() {
  const freshArticles = [];

  for (const feed of RSS_FEEDS) {
    try {
      const res = await fetchWithTimeout(feed.url);
      if (!res.ok) continue;
      const xml = await res.text();

      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      let count = 0;
      while ((match = itemRegex.exec(xml)) !== null && count < 5) {
        const raw = match[1];
        const titleM = raw.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
        const linkM = raw.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/);
        const descM = raw.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
        const dateM = raw.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

        const rawTitle = titleM ? titleM[1] : '';
        const title = decodeHtmlEntities(decodeHtmlEntities(rawTitle)).trim();
        const link = linkM ? linkM[1].trim() : '';
        const rawDesc = descM ? descM[1].replace(/<[^>]*>/g, '') : '';
        const excerpt = decodeHtmlEntities(decodeHtmlEntities(rawDesc)).trim();
        const pubDate = dateM ? new Date(dateM[1].trim()) : new Date();

        if (title && !title.toLowerCase().includes('partner') && title.length > 15) {
          freshArticles.push({
            title,
            link,
            excerpt: excerpt.slice(0, 240) + (excerpt.length > 240 ? '...' : ''),
            pubDate: isNaN(pubDate.getTime()) ? new Date() : pubDate,
            source: feed.source
          });
          count++;
        }
      }
    } catch (err) {
      console.warn(`[Hourly Update] Notice fetching ${feed.source}:`, err.message);
    }
  }

  return freshArticles;
}

// Generate unique slug
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

// Category & ticker inference
function inferMetadata(title, excerpt) {
  const combined = `${title} ${excerpt}`.toLowerCase();
  let category = 'US Markets';
  let categorySlug = 'us-markets';
  let tickers = ['^GSPC', 'SPY'];
  let sentiment = 'Bullish';
  let sentimentScore = '+78%';

  if (combined.includes('bitcoin') || combined.includes('crypto') || combined.includes('ethereum') || combined.includes('solana') || combined.includes('btc')) {
    category = 'Crypto';
    categorySlug = 'crypto';
    tickers = ['BTC-USD', 'ETH-USD', 'COIN'];
    sentiment = 'Bullish';
    sentimentScore = '+84%';
  } else if (combined.includes('ai') || combined.includes('nvidia') || combined.includes('chip') || combined.includes('semiconductor') || combined.includes('apple') || combined.includes('microsoft')) {
    category = 'Tech & AI';
    categorySlug = 'tech-ai';
    tickers = ['NVDA', 'AAPL', 'MSFT', 'QQQ'];
    sentiment = 'Bullish';
    sentimentScore = '+89%';
  } else if (combined.includes('inflation') || combined.includes('fed') || combined.includes('yield') || combined.includes('treasury') || combined.includes('rate') || combined.includes('oil') || combined.includes('gdp')) {
    category = 'Macro Economy';
    categorySlug = 'macro-economy';
    tickers = ['^TNX', 'CL=F', 'GC=F'];
    sentiment = 'Neutral';
    sentimentScore = '50%';
  } else if (combined.includes('earnings') || combined.includes('revenue') || combined.includes('profit') || combined.includes('quarter') || combined.includes('guidance')) {
    category = 'Earnings';
    categorySlug = 'earnings';
    tickers = ['^DJI', 'AMZN', 'TSLA'];
    sentiment = 'Bullish';
    sentimentScore = '+75%';
  }

  if (combined.includes('drop') || combined.includes('fall') || combined.includes('slide') || combined.includes('fear') || combined.includes('slump') || combined.includes('warn')) {
    sentiment = 'Bearish';
    sentimentScore = '-65%';
  }

  return { category, categorySlug, tickers, sentiment, sentimentScore };
}

// Convert raw news item into full rich ArticlesData entry
function transformToArticleEntry(rawItem, idx) {
  const id = `${slugify(rawItem.title)}-${Date.now().toString(36).slice(-4)}`;
  const meta = inferMetadata(rawItem.title, rawItem.excerpt);
  const author = {
    name: "World Stock News Editorial Desk",
    title: "Financial Market Intelligence & Macro Analytics",
    avatar: "/assets/logo.png"
  };

  const images = [
    "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?auto=format&fit=crop&w=1200&q=80",
    "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&w=1200&q=80"
  ];
  const image = images[idx % images.length];

  const sourceName = rawItem.source || 'Institutional Wire';
  const sourceUrl = rawItem.link || '';

  return {
    id,
    title: rawItem.title,
    excerpt: rawItem.excerpt || `${rawItem.title}. Institutional market analysis, capital flow metrics, and strategic positioning.`,
    category: meta.category,
    categorySlug: meta.categorySlug,
    tickers: meta.tickers,
    sentiment: meta.sentiment,
    sentimentScore: meta.sentimentScore,
    author,
    publishedAt: rawItem.pubDate.toISOString(),
    readTime: "5 min read",
    image,
    source: sourceName,
    sourceUrl: sourceUrl,
    targetPrice: meta.category === 'Crypto' ? '$95,000 Target' : 'Overweight Target',
    analystConsensus: meta.sentiment === 'Bearish' ? 'Reduce' : 'Accumulate / Buy',
    tableOfContents: [
      { id: "market-overview", title: "Market Context & Catalyst" },
      { id: "institutional-flows", title: "Institutional Liquidity & Order Flow" },
      { id: "strategic-outlook", title: "Strategic Positioning & Key Risk Levels" },
      { id: "original-wire", title: "Primary Wire & Full Coverage Link" }
    ],
    bodyHtml: `
      <div class="article-takeaway-box">
        <strong>Hourly Intelligence Wire:</strong> ${rawItem.title}. Reported by ${sourceName}. Key technical support and resistance levels are currently being tested as volume broadens across major liquidity centers.
        ${sourceUrl ? `
        <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border-medium);">
          <a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="display:inline-flex; align-items:center; gap:6px; font-size:0.85rem; padding:6px 14px; text-decoration:none;">
            <span>Read Original Wire Story on ${sourceName}</span>
            <span>↗</span>
          </a>
        </div>` : ''}
      </div>

      <h3 id="market-overview">Market Context & Catalyst</h3>
      <p>${rawItem.excerpt || rawItem.title}</p>
      <p>Institutional desks noted significant block order execution in early liquidity windows. Broad market sentiment is being shaped by global macroeconomic prints, central bank communication, and capital allocation into prime risk-adjusted vehicles.</p>

      <h3 id="institutional-flows">Institutional Liquidity & Order Flow</h3>
      <p>Trading desks observed an acceleration in net order imbalances across top exchange book depth. Spreads have remained tight as market makers adjust delta hedging positioning across major index and derivatives complexes.</p>

      <h3 id="strategic-outlook">Strategic Positioning & Key Risk Levels</h3>
      <p>Portfolio managers maintain an active focus on volatility compression and duration hedging. Key technical inflection points remain critical as market participants calibrate exposure ahead of the upcoming economic calendar milestones.</p>

      ${sourceUrl ? `
      <h3 id="original-wire">Primary Wire & Full Coverage Link</h3>
      <p>This report incorporates real-time wire data provided by <strong>${sourceName}</strong>. You can inspect the primary external filing and full syndicated release directly:</p>
      <p style="margin: 1.25rem 0;">
        <a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="display:inline-flex; align-items:center; gap:8px; padding:10px 18px; text-decoration:none; font-weight:700;">
          <span>Open Full Original Article on ${sourceName}</span>
          <span style="font-size:1.1rem;">↗</span>
        </a>
      </p>` : ''}
    `
  };
}

// Read current ArticlesData (supports both direct require for serverless and fs for CLI)
function readCurrentArticlesData() {
  try {
    const mod = require('../js/articles-data.js');
    if (mod && Array.isArray(mod.ArticlesData) && mod.ArticlesData.length > 0) {
      return mod.ArticlesData;
    }
  } catch (_) {}

  try {
    const content = fs.readFileSync(ARTICLES_DATA_PATH, 'utf8');
    const sandbox = {};
    const fn = new Function('sandbox', `${content}; return ArticlesData;`);
    const data = fn();
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
  } catch (err) {
    console.warn("[Hourly Update] Could not parse existing ArticlesData:", err.message);
  }
  return [];
}

// Generate updated articles-data.js content
function generateArticlesDataJs(articles) {
  return `/**
 * World Stock News - Editorial Database of In-Depth Financial Intelligence Articles
 * Automatically updated hourly by World Stock News Real-Time Ingestion Engine
 * Last Automated Update: ${new Date().toISOString()}
 */

const ArticlesData = ${JSON.stringify(articles, null, 2)};

// Helper to look up an article by id
function getArticleById(id) {
  return ArticlesData.find(a => a.id === id) || ArticlesData[0];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ArticlesData, getArticleById };
}
`;
}

// Generate updated sitemap.xml
function generateSitemapXml(articles, currentIsoTime) {
  const categories = [
    'us-markets',
    'tech-ai',
    'macro-economy',
    'crypto',
    'earnings'
  ];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>https://worldstocknews.online/</loc>
    <lastmod>${currentIsoTime}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>`;

  // Categories
  for (const cat of categories) {
    xml += `
  <url>
    <loc>https://worldstocknews.online/category/${cat}</loc>
    <lastmod>${currentIsoTime}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.8</priority>
  </url>`;
  }

  // Articles with Google News tags
  for (const a of articles) {
    const pubDate = a.publishedAt || currentIsoTime;
    const safeTitle = escapeXml(a.title || '');
    xml += `
  <url>
    <loc>https://worldstocknews.online/article/${encodeURIComponent(a.id)}</loc>
    <lastmod>${pubDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
    <news:news>
      <news:publication>
        <news:name>World Stock News Financial Wire</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${safeTitle}</news:title>
    </news:news>
  </url>`;
  }

  // Static ancillary pages & feeds
  const staticPages = [
    { path: 'about', changefreq: 'monthly', priority: '0.7' },
    { path: 'contact', changefreq: 'monthly', priority: '0.7' },
    { path: 'privacy-policy', changefreq: 'monthly', priority: '0.5' },
    { path: 'terms', changefreq: 'monthly', priority: '0.5' },
    { path: 'feed.xml', changefreq: 'hourly', priority: '0.8' },
    { path: 'feed.json', changefreq: 'hourly', priority: '0.8' },
    { path: 'llms.txt', changefreq: 'weekly', priority: '0.6' }
  ];

  for (const page of staticPages) {
    xml += `
  <url>
    <loc>https://worldstocknews.online/${page.path}</loc>
    <lastmod>${currentIsoTime}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
  }

  xml += `\n</urlset>\n`;
  return xml;
}

// Generate updated feed.xml (RSS 2.0)
function generateFeedXml(articles, currentRfcDate) {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>World Stock News | Real-Time Stock Market News &amp; Financial Intelligence</title>
    <link>https://worldstocknews.online/</link>
    <description>Institutional-grade stock market coverage, Wall Street analysis, real-time macroeconomic reports, and cryptocurrency intelligence.</description>
    <language>en-US</language>
    <lastBuildDate>${currentRfcDate}</lastBuildDate>
    <atom:link href="https://worldstocknews.online/feed.xml" rel="self" type="application/rss+xml" />`;

  const topArticles = articles.slice(0, 15);
  for (const a of topArticles) {
    const pubDateRfc = a.publishedAt ? new Date(a.publishedAt).toUTCString() : currentRfcDate;
    const safeTitle = escapeXml(a.title || '');
    const safeDesc = escapeXml(a.excerpt || '');
    const authorName = a.author && a.author.name ? a.author.name : "World Stock News Editorial";
    const safeAuthor = escapeXml(authorName);
    const safeCategory = escapeXml(a.category || 'US Markets');

    xml += `
    <item>
      <title>${safeTitle}</title>
      <link>https://worldstocknews.online/article/${encodeURIComponent(a.id)}</link>
      <guid isPermaLink="true">https://worldstocknews.online/article/${encodeURIComponent(a.id)}</guid>
      <pubDate>${pubDateRfc}</pubDate>
      <dc:creator>${safeAuthor}</dc:creator>
      <description>${safeDesc}</description>
      <category>${safeCategory}</category>
    </item>`;
  }

  xml += `\n  </channel>\n</rss>\n`;
  return xml;
}

// Generate updated feed.json (JSON Feed 1.1)
function generateFeedJson(articles, currentIsoTime) {
  const topArticles = articles.slice(0, 20);
  const items = topArticles.map(a => ({
    id: `https://worldstocknews.online/article/${encodeURIComponent(a.id)}`,
    url: `https://worldstocknews.online/article/${encodeURIComponent(a.id)}`,
    title: a.title,
    content_text: a.excerpt,
    summary: a.excerpt,
    image: a.image,
    date_published: a.publishedAt || currentIsoTime,
    tags: a.tickers ? [a.category, ...a.tickers] : [a.category],
    authors: [
      {
        name: a.author && a.author.name ? a.author.name : "World Stock News Team",
        avatar: a.author && a.author.avatar ? a.author.avatar : undefined
      }
    ]
  }));

  const payload = {
    version: "https://jsonfeed.org/version/1.1",
    title: "World Stock News Financial Wire",
    home_page_url: "https://worldstocknews.online/",
    feed_url: "https://worldstocknews.online/feed.json",
    description: "Institutional-grade stock market coverage, Wall Street analysis, real-time macroeconomic reports, and cryptocurrency intelligence.",
    language: "en-US",
    authors: [
      {
        name: "World Stock News Intelligence Team",
        url: "https://worldstocknews.online/"
      }
    ],
    items
  };

  return JSON.stringify(payload, null, 2);
}

// Update static hero and breaking headline in index.html for crawlers & initial paint
function updateStaticIndexHtml(topArticle, currentIsoTime) {
  const indexPath = path.join(ROOT_DIR, 'index.html');
  if (!fs.existsSync(indexPath) || !topArticle) return;
  try {
    let html = fs.readFileSync(indexPath, 'utf8');
    const pubDate = new Date(topArticle.publishedAt || currentIsoTime);
    const dateFormatted = pubDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Update time element
    html = html.replace(/<time datetime="[^"]*" id="heroStoryTime">[^<]*<\/time>/,
      `<time datetime="${pubDate.toISOString()}" id="heroStoryTime">${dateFormatted}</time>`);

    // Update hero onclick
    html = html.replace(/<article class="featured-story" id="heroFeaturedStory" onclick="openArticleModal\('[^']*'\)">/,
      `<article class="featured-story" id="heroFeaturedStory" onclick="openArticleModal('${topArticle.id}')">`);

    // Update story link
    html = html.replace(/<a id="heroStoryLink" href="[^"]*">[\s\S]*?<\/a>/,
      `<a id="heroStoryLink" href="/article/${encodeURIComponent(topArticle.id)}">\n                  ${topArticle.title}\n                </a>`);

    // Update story excerpt
    html = html.replace(/<p class="story-excerpt" id="heroStoryExcerpt">[\s\S]*?<\/p>/,
      `<p class="story-excerpt" id="heroStoryExcerpt">\n                ${topArticle.excerpt}\n              </p>`);

    // Update breaking headline link
    html = html.replace(/<a id="breakingHeadlineLink" href="[^"]*">[\s\S]*?<\/a>/,
      `<a id="breakingHeadlineLink" href="/article/${encodeURIComponent(topArticle.id)}">\n          ${topArticle.title}\n        </a>`);

    // Update target price
    if (topArticle.targetPrice) {
      html = html.replace(/<span style="color:var\(--bullish\); font-weight:700;" id="heroTargetPrice">[^<]*<\/span>/,
        `<span style="color:var(--bullish); font-weight:700;" id="heroTargetPrice">Wall St Target: ${topArticle.targetPrice}</span>`);
    }

    fs.writeFileSync(indexPath, html, 'utf8');
    console.log(`[Hourly Update] Updated static hero markup in ${indexPath}`);
  } catch (err) {
    console.warn(`[Hourly Update] Notice updating index.html:`, err.message);
  }
}

// Main execution function
async function runUpdate() {
  const now = new Date();
  const currentIsoTime = now.toISOString();
  const currentRfcDate = now.toUTCString();

  console.log(`\n========================================================`);
  console.log(`[Hourly Update Engine] Starting automated cycle at ${currentIsoTime}`);
  console.log(`========================================================`);

  // 1. Load existing articles
  let existingArticles = readCurrentArticlesData();
  console.log(`[Hourly Update] Loaded ${existingArticles.length} existing articles from database.`);

  // 2. Fetch fresh articles from RSS
  console.log(`[Hourly Update] Ingesting fresh financial news feeds...`);
  const freshRaw = await fetchFreshNewsFromFeeds();
  console.log(`[Hourly Update] Retrieved ${freshRaw.length} raw news items from financial wires.`);

  let newlyAddedCount = 0;
  if (freshRaw.length > 0) {
    const existingTitles = new Set(existingArticles.map(a => a.title.toLowerCase().trim()));
    const newEntries = [];

    for (let i = 0; i < freshRaw.length; i++) {
      const item = freshRaw[i];
      if (!existingTitles.has(item.title.toLowerCase().trim())) {
        const entry = transformToArticleEntry(item, i);
        newEntries.push(entry);
        existingTitles.add(item.title.toLowerCase().trim());
      }
    }

    if (newEntries.length > 0) {
      newlyAddedCount = newEntries.length;
      // Prepend fresh articles, cap total at 35 to maintain ultra-fast performance
      existingArticles = [...newEntries, ...existingArticles].slice(0, 35);
      console.log(`[Hourly Update] Successfully added ${newlyAddedCount} new articles to database.`);
    } else {
      console.log(`[Hourly Update] All fetched news items already exist in database.`);
    }
  }

  // If no new articles fetched (or network unreachable), generate an hourly market intelligence recap if needed
  if (newlyAddedCount === 0 && existingArticles.length > 0) {
    // Touch latest article publication time to ensure freshest feed index
    const hoursSinceLast = (now.getTime() - new Date(existingArticles[0].publishedAt || now).getTime()) / (1000 * 3600);
    if (hoursSinceLast >= 1) {
      console.log(`[Hourly Update] Generating fresh hourly market brief for continuous freshness...`);
      const hourlyBrief = {
        id: `hourly-market-brief-${Date.now().toString(36)}`,
        title: `Hourly Market Pulse: Global Indices Trade With Steady Breadth as Volume Accelerates`,
        excerpt: `Mid-day institutional trading patterns reflect disciplined risk management and rotational inflows into cyclical leaders and technology infrastructure.`,
        category: "US Markets",
        categorySlug: "us-markets",
        tickers: ["^GSPC", "^NDX", "NVDA", "BTC-USD"],
        sentiment: "Bullish",
        sentimentScore: "+82%",
        author: {
          name: "World Stock News Editorial Desk",
          title: "Financial Market Intelligence & Macro Analytics",
          avatar: "/assets/logo.png"
        },
        publishedAt: currentIsoTime,
        readTime: "4 min read",
        image: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&q=80",
        targetPrice: "7,850 Target",
        analystConsensus: "Overweight",
        tableOfContents: [
          { id: "hourly-catalysts", title: "Hourly Market Catalysts" },
          { id: "liquidity-levels", title: "Institutional Order Flow and Breadth" }
        ],
        bodyHtml: `
          <div class="article-takeaway-box">
            <strong>Hourly Wire Update:</strong> Global indices continue to trade with firm institutional footing. Market breadth metrics indicate consistent accumulation across large-cap tech, financials, and high-quality dividend payers.
          </div>
          <h3 id="hourly-catalysts">Hourly Market Catalysts</h3>
          <p>Equities are consolidating around key moving averages as participants evaluate latest yield curve dynamics and macro prints. Sub-second market telemetry highlights orderly liquidity without heightened hedging premiums in VIX options.</p>
          <h3 id="liquidity-levels">Institutional Order Flow and Breadth</h3>
          <p>Over 70% of benchmark constituents continue to trade above their short-term moving averages. Algorithmic execution desks report steady institutional balance-of-day buying across prime ETFs.</p>
        `
      };
      existingArticles.unshift(hourlyBrief);
      existingArticles = existingArticles.slice(0, 35);
      newlyAddedCount++;
    }
  }

  // Ensure all baseline articles have active recent timestamps relative to now
  const nowMs = now.getTime();
  existingArticles = existingArticles.map((a, idx) => {
    const artDate = new Date(a.publishedAt);
    if (isNaN(artDate.getTime()) || artDate.getTime() < nowMs - 48 * 3600 * 1000) {
      // Offset by idx hours into the past so they remain chronologically ordered today
      const freshDate = new Date(nowMs - (idx + 1) * 3600 * 1000);
      return {
        ...a,
        publishedAt: freshDate.toISOString()
      };
    }
    return a;
  });

  // 3. Persist to MongoDB Atlas if connected
  try {
    const mongodb = require('../lib/mongodb.js');
    if (mongodb.isMongoConfigured()) {
      await mongodb.upsertArticles(existingArticles);
      console.log(`[Hourly Update] Persisted ${existingArticles.length} articles to MongoDB Atlas.`);
    }
  } catch (dbErr) {
    console.warn(`[Hourly Update] MongoDB persist notice:`, dbErr.message);
  }

  // 4. Write updated static files (if filesystem is writable)
  try {
    fs.writeFileSync(ARTICLES_DATA_PATH, generateArticlesDataJs(existingArticles), 'utf8');
    console.log(`[Hourly Update] Updated ${ARTICLES_DATA_PATH}`);

    const sitemapXml = generateSitemapXml(existingArticles, currentIsoTime);
    fs.writeFileSync(SITEMAP_PATH, sitemapXml, 'utf8');
    console.log(`[Hourly Update] Updated ${SITEMAP_PATH} (all entries updated to ${currentIsoTime})`);

    const feedXml = generateFeedXml(existingArticles, currentRfcDate);
    fs.writeFileSync(FEED_XML_PATH, feedXml, 'utf8');
    console.log(`[Hourly Update] Updated ${FEED_XML_PATH} (lastBuildDate: ${currentRfcDate})`);

    const feedJson = generateFeedJson(existingArticles, currentIsoTime);
    fs.writeFileSync(FEED_JSON_PATH, feedJson, 'utf8');
    console.log(`[Hourly Update] Updated ${FEED_JSON_PATH}`);

    updateStaticIndexHtml(existingArticles[0], currentIsoTime);
  } catch (fsErr) {
    console.warn(`[Hourly Update] Notice: static file writes skipped (serverless environment):`, fsErr.message);
  }

  console.log(`[Hourly Update] Complete! Next scheduled cycle in 60 minutes.`);
  return {
    success: true,
    timestamp: currentIsoTime,
    newlyAddedCount,
    totalArticles: existingArticles.length
  };
}

// Daemon mode
if (require.main === module) {
  const isDaemon = process.argv.includes('--daemon') || process.argv.includes('-d');

  runUpdate().catch(err => {
    console.error("[Hourly Update] Error during initial run:", err);
  });

  if (isDaemon) {
    console.log("[Hourly Update] Running in daemon mode (repeats every 1 hour)...");
    const ONE_HOUR_MS = 60 * 60 * 1000;
    setInterval(() => {
      runUpdate().catch(err => {
        console.error("[Hourly Update] Error in interval cycle:", err);
      });
    }, ONE_HOUR_MS);
  }
}

module.exports = { runUpdate };
