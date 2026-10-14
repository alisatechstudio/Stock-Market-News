# World Stock News 📈 | Institutional-Grade Stock Market News & Real-Time Financial Intelligence

An institutional-grade, high-performance Stock Market News and Financial Intelligence blog platform engineered with multi-API open telemetry, interactive canvas financial charting, dynamic market simulation, and comprehensive Search Engine Optimization (SEO).

![World Stock News Demo](https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&q=80)

---

## 🚀 Key Features

### 1. Free Multi-API Telemetry & Resilient Market Engine
- **Frankfurter Open API**: 100% free, no-key-required live Forex currency exchange rates (USD/EUR, GBP, JPY, CAD, AUD).
- **CoinGecko Public API**: Real-time cryptocurrency telemetry (Bitcoin, Ethereum, Solana) with 24-hour percentage variations.
- **RSS Wire Aggregation**: Ingestion support for open financial news RSS feeds (Yahoo Finance, SEC Edgar wire).
- **High-Frequency Micro-Tick Simulator**: Realistic market depth engine simulating sub-second ticks, volatility, bid/ask spreads, and flash color pulses for the S&P 500, Nasdaq 100, Dow Jones, Russell 2000, Crude Oil, Gold Spot, and 10-Yr Treasury Yields.

### 2. State-of-the-Art Financial Terminal Design
- **Theme Engine**: Ultra-sleek Obsidian Dark Mode (default) & Clean Financial Light Mode with smooth CSS variable transitions.
- **Live Ticker Ribbon**: Infinite CSS hardware-accelerated ticker marquee with hover pause and dynamic tick updates.
- **Interactive Financial Chart Explorer**: HTML5 Canvas engine supporting Candlestick and Line charts, 20-period Simple Moving Average (SMA 20), dynamic trading volume histogram, timeframes (1D, 1W, 1M, 1Y, 5Y), and interactive crosshairs.
- **Fear & Greed Index Gauge**: Custom canvas dial gauge visualizing real-time market sentiment from Extreme Fear to Extreme Greed with historical tracking.
- **Market Movers & Telemetry**: Top gainers, decliners, volume leaders, and miniature sparklines.
- **Compound Investment Calculator**: Interactive stock growth and compound interest forecasting tool with instant recalculation.
- **High-Impact Economic Calendar**: Tracking upcoming FOMC decisions, CPI prints, Non-Farm Payrolls, and tech earnings calls.

### 3. #1 in SEO Architecture
- **Semantic HTML5 Structure**: Full semantic hierarchy (`<header>`, `<nav>`, `<main>`, `<article>`, `<section>`, `<aside>`, `<time>`, `<footer>`).
- **Comprehensive Schema.org Structured Data (JSON-LD)**:
  - `NewsMediaOrganization` & `WebSite` schemas
  - `NewsArticle` schemas with headline, datePublished, author credentials, publisher logo, and canonical entities
  - `BreadcrumbList` for Google rich sitelink breadcrumbs
  - `FAQPage` schema on market questions for Google expandable rich FAQ snippets
  - `SpeakableSpecification` for AI voice assistants, audio summaries, and Google AI Overviews
- **Universal AI Bot Crawler Integration (`robots.txt`)**:
  - Explicit directives for OpenAI (`GPTBot`, `ChatGPT-User`, `OAI-SearchBot`), Anthropic (`ClaudeBot`, `Claude-Web`), Perplexity (`PerplexityBot`), Apple Intelligence (`Applebot`, `Applebot-Extended`), Google (`Google-Extended`, `GoogleOther`), Meta (`Meta-ExternalAgent`, `Meta-ExternalFetcher`), Microsoft Copilot (`msnbot`), Amazon (`Amazonbot`), Cohere (`Cohere-ai`), ByteDance (`Bytespider`), Mistral (`MistralBot`), and Common Crawl (`CCBot`).
- **Emerging LLM Standards (`llms.txt`)**:
  - Implementation of `llms.txt` according to the llmstxt.org specification, allowing AI search engines to read clean, structured Markdown context directly.
- **Multi-Format Machine Syndication**:
  - `sitemap.xml` for search indexers with Google News extensions.
  - `feed.xml` RSS 2.0 syndication feed.
  - `feed.json` JSON Feed 1.1 specification for programmatic agents and automated bots.
- **Core Web Vitals Optimized**: Zero layout shifts (CLS), responsive down to 320px mobile screens, lightweight native code with zero heavy framework overhead.

---

## 📁 Repository Structure

```
├── index.html              # Master financial news portal & live terminal
├── article.html            # Standalone SEO-optimized deep-dive reader
├── sitemap.xml             # Google News & XML Sitemap
├── robots.txt              # Search engine & AI bot crawler directives
├── llms.txt                # Machine-readable LLM context manifest
├── feed.xml                # RSS 2.0 syndication feed
├── feed.json               # JSON Feed 1.1 specification for AI pipelines
├── manifest.json           # Progressive Web App manifest
├── package.json            # GitHub Packages NPM configuration (@alisatechstudio)
├── .npmrc                  # NPM scope registry configuration
├── index.js                # Programmatic Node.js library entry point
├── css/
│   └── style.css           # Terminal design system, typography & animations
├── js/
│   ├── api.js              # Multi-API connector & real-time simulation engine
│   ├── articles-data.js    # Editorial financial analysis database
│   ├── charts.js           # Interactive Canvas charting & Fear/Greed gauge
│   └── main.js             # UI controller, search modal, calculator & SEO
└── README.md
```

---

## 📦 Using as a GitHub Packages NPM Dependency

This project is configured as a scoped package: **`@alisatechstudio/stock-market-news`**.

### 1. Authenticate to GitHub Packages
In your project's `.npmrc`:
```ini
@alisatechstudio:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PERSONAL_ACCESS_TOKEN
```

### 2. Install Package
```bash
npm install @alisatechstudio/stock-market-news
```

### 3. Programmatic Usage in Node.js
```javascript
const { ArticlesData, getArticleById, getTickersSummary } = require('@alisatechstudio/stock-market-news');

// Access live market articles and ticker data
console.log(ArticlesData);
console.log(getTickersSummary());
```

---

## ⚡ Local Preview

To launch the project locally:
```bash
# Using any static web server, e.g. python or npx serve:
python -m http.server 8080
# Or using Node:
npx serve .
```
Then visit `http://localhost:8080` in your web browser.

---

## 📄 License & Regulatory Disclaimer
World Stock News is designed for educational and informational purposes only. Securities trading carries inherent financial risk. Always consult a certified financial advisor before trading.
