/**
 * World Stock News - Main Application Controller
 * Handles UI interactions, live telemetry, filters, modals, watchlist, calculator, and SEO Schema
 */

// Immediate global handler to ensure openArticleModal is always defined immediately
window.openArticleModal = window.openArticleModal || function(articleId) {
  if (articleId) {
    window.location.href = `/article/${encodeURIComponent(articleId)}`;
  }
};

document.addEventListener("DOMContentLoaded", () => {
  // Initialize APIs and charting engine defensively
  if (typeof MarketAPI !== 'undefined' && typeof MarketAPI.init === 'function') {
    MarketAPI.init();
  }
  if (typeof StockChart !== 'undefined' && typeof StockChart.init === 'function' && document.getElementById("mainStockCanvas")) {
    StockChart.init("mainStockCanvas");
  }

  // App State
  let currentCategory = "all";
  let userWatchlist = JSON.parse(localStorage.getItem("mp_watchlist") || '["NVDA", "AAPL", "BTC-USD"]');
  let currentTheme = localStorage.getItem("mp_theme") || "dark";
  let lastHourlySyncTime = Date.now();

  // Apply Theme
  applyTheme(currentTheme);

  // Initialize UI Components defensively
  initTickerRibbon();
  initTelemetryCards();
  initFearGreedWidget();
  initMoversWidget();
  initCategoryTabs();
  renderArticlesList();
  syncArticlesFromApi();
  initSearch();
  initCalculator();
  initFaqAccordions();
  initNewsletter();
  initArticleModal();
  initChartControls();
  injectDynamicSeoSchema();
  // Cookie consent is handled by js/gdpr-consent.js
  initMobileMenu();
  initBreakingNewsWire();
  startClientHourlyAutoUpdate();

  // Listen to live price updates from MarketAPI
  if (typeof MarketAPI !== 'undefined' && typeof MarketAPI.subscribe === 'function') {
    MarketAPI.subscribe((key, data) => {
      updateTickerElement(key, data);
      initMoversWidget();
      if (typeof StockChart !== 'undefined' && typeof StockChart.onPriceTick === 'function') {
        StockChart.onPriceTick(key, data);
      }
    });
  }

  async function initBreakingNewsWire() {
    try {
      const articles = await MarketAPI.fetchLiveNewsWire();
      if (articles && articles.length > 0) {
        const headlineEl = document.getElementById("breakingHeadlineLink");
        if (headlineEl) {
          headlineEl.textContent = `${articles[0].title} — ${articles[0].source}`;
          if (articles[0].link) headlineEl.href = articles[0].link;
          headlineEl.target = "_blank";
          headlineEl.rel = "noopener noreferrer";
        }
      }
    } catch (e) {
      console.info("Breaking wire notice:", e.message);
    }
  }

  /* ========================================================================
     AUTOMATED CLIENT-SIDE HOURLY UPDATE ENGINE
     ======================================================================== */
  function startClientHourlyAutoUpdate() {
    // 1. Re-poll breaking news wire every 5 minutes
    setInterval(() => {
      initBreakingNewsWire();
    }, 5 * 60 * 1000);

    // 2. Comprehensive hourly auto-refresh (every 60 minutes)
    const ONE_HOUR = 60 * 60 * 1000;
    setInterval(async () => {
      console.log("[Client] Executing automated hourly refresh...");
      lastHourlySyncTime = Date.now();
      try {
        await MarketAPI.fetchLiveQuotes();
        await MarketAPI.fetchFearGreedIndex();
        await initBreakingNewsWire();
        
        // Dynamically re-evaluate articles if feed updated
        try {
          const res = await fetch(`feed.json?t=${Date.now()}`);
          if (res.ok) {
            renderArticlesList();
          }
        } catch (_) {}

        updateHourlyBadgeStatus();
        showToast("Hourly update: Latest financial telemetry refreshed");
      } catch (err) {
        console.warn("[Client] Hourly refresh notice:", err.message);
      }
    }, ONE_HOUR);

    // Update relative "X mins ago" badge text every minute
    setInterval(updateHourlyBadgeStatus, 60 * 1000);
    updateHourlyBadgeStatus();
  }

  function updateHourlyBadgeStatus() {
    const badgeText = document.getElementById("autoUpdateStatusText");
    if (!badgeText) return;
    const syncTime = (typeof lastHourlySyncTime !== 'undefined' && lastHourlySyncTime) ? lastHourlySyncTime : Date.now();
    const minsAgo = Math.floor((Date.now() - syncTime) / 60000);
    if (minsAgo <= 0) {
      badgeText.textContent = "Auto-updated hourly • Updated just now";
    } else {
      badgeText.textContent = `Auto-updated hourly • Updated ${minsAgo}m ago`;
    }
  }

  /* ========================================================================
     THEME SWITCHER
     ======================================================================== */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("mp_theme", theme);
    const themeBtn = document.getElementById("themeToggleBtn");
    if (themeBtn) {
      themeBtn.innerHTML = theme === "dark" 
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    }
    // Re-render chart for proper colors defensively
    setTimeout(() => {
      if (typeof StockChart !== 'undefined' && typeof StockChart.render === 'function' && document.getElementById("mainStockCanvas")) {
        StockChart.render();
      }
      if (typeof MarketAPI !== 'undefined' && typeof StockChart !== 'undefined' && document.getElementById("fearGreedCanvas")) {
        const fg = MarketAPI.getFearGreedIndex();
        if (fg) StockChart.drawFearGreedGauge("fearGreedCanvas", fg.score);
      }
    }, 100);
  }

  const themeToggle = document.getElementById("themeToggleBtn");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      currentTheme = currentTheme === "dark" ? "light" : "dark";
      applyTheme(currentTheme);
      showToast(`Switched to ${currentTheme} mode`);
    });
  }

  /* ========================================================================
     TICKER RIBBON MARQUEE
     ======================================================================== */
  function initTickerRibbon() {
    const track = document.getElementById("tickerTrack");
    if (!track || typeof MarketAPI === 'undefined') return;

    const tickers = MarketAPI.getAllTickers ? MarketAPI.getAllTickers() : {};
    let html = "";
    // Duplicate twice for seamless infinite CSS animation
    for (let rep = 0; rep < 2; rep++) {
      Object.keys(tickers).forEach(key => {
        const item = tickers[key];
        const isPos = item.change >= 0;
        html += `
          <div class="ticker-item" data-ticker-key="${key}" onclick="selectChartTicker('${key}')">
            <span class="ticker-symbol">${item.symbol}</span>
            <span class="ticker-price tabular-nums" id="tick-p-${rep}-${key.replace(/[^a-zA-Z0-9]/g, '')}">$${item.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            <span class="ticker-change tabular-nums ${isPos ? 'pos' : 'neg'}" id="tick-c-${rep}-${key.replace(/[^a-zA-Z0-9]/g, '')}">
              ${isPos ? '▲' : '▼'} ${Math.abs(item.changePct).toFixed(2)}%
            </span>
          </div>
        `;
      });
    }
    track.innerHTML = html;
  }

  function updateTickerElement(key, data) {
    const safeKey = key.replace(/[^a-zA-Z0-9]/g, '');
    for (let rep = 0; rep < 2; rep++) {
      const priceEl = document.getElementById(`tick-p-${rep}-${safeKey}`);
      const changeEl = document.getElementById(`tick-c-${rep}-${safeKey}`);
      if (priceEl && changeEl) {
        const isPos = data.change >= 0;
        priceEl.textContent = `$${data.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        changeEl.className = `ticker-change tabular-nums ${isPos ? 'pos' : 'neg'}`;
        changeEl.textContent = `${isPos ? '▲' : '▼'} ${Math.abs(data.changePct).toFixed(2)}%`;
      }
    }

    // Telemetry cards update
    const cardPrice = document.getElementById(`telem-price-${safeKey}`);
    const cardChange = document.getElementById(`telem-change-${safeKey}`);
    if (cardPrice && cardChange) {
      const isPos = data.change >= 0;
      cardPrice.textContent = `$${data.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
      cardChange.className = `telemetry-badge ${isPos ? 'pos' : 'neg'}`;
      cardChange.textContent = `${isPos ? '+' : ''}${data.changePct.toFixed(2)}%`;
    }

    // Filter chip price update if rendered in toolbar
    const chip = document.querySelector(`[data-chart-ticker="${key}"]`);
    if (chip) {
      const isPos = data.change >= 0;
      const isFx = data.type === "forex" || key === "EURUSD";
      const priceSpan = chip.querySelector(".chip-price");
      const changeSpan = chip.querySelector(".chip-change");
      if (priceSpan) priceSpan.textContent = `$${data.price.toLocaleString(undefined, { minimumFractionDigits: isFx ? 4 : 2 })}`;
      if (changeSpan) {
        changeSpan.className = `chip-change ${isPos ? 'pos' : 'neg'}`;
        changeSpan.textContent = `${isPos ? '+' : ''}${data.changePct.toFixed(2)}%`;
      }
    }
  }

  /* ========================================================================
     MARKET TELEMETRY CARDS (TOP INDICES)
     ======================================================================== */
  function initTelemetryCards() {
    const grid = document.getElementById("telemetryGrid");
    if (!grid || typeof MarketAPI === 'undefined') return;

    const featuredKeys = ["^GSPC", "^NDX", "NVDA", "BTC-USD", "GC=F", "^TNX"];
    let html = "";

    featuredKeys.forEach(k => {
      const item = MarketAPI.getTicker(k);
      if (!item) return;
      const safeKey = k.replace(/[^a-zA-Z0-9]/g, '');
      const isPos = item.change >= 0;

      html += `
        <div class="telemetry-card" onclick="selectChartTicker('${k}')">
          <div class="telemetry-header">
            <span class="telemetry-name">${item.name}</span>
            <span class="telemetry-badge ${isPos ? 'pos' : 'neg'}" id="telem-change-${safeKey}">
              ${isPos ? '+' : ''}${item.changePct.toFixed(2)}%
            </span>
          </div>
          <div class="telemetry-price tabular-nums" id="telem-price-${safeKey}">
            $${item.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div class="telemetry-meta">
            <span style="color:var(--text-muted)">Vol: ${item.volume}</span>
            <span style="font-weight:700; color:${isPos ? 'var(--bullish)' : 'var(--bearish)'}">${isPos ? '▲ Active Bull' : '▼ Consolidating'}</span>
          </div>
          <canvas class="sparkline-canvas" id="spark-${safeKey}"></canvas>
        </div>
      `;
    });

    grid.innerHTML = html;

    // Render real sparklines
    setTimeout(async () => {
      for (const k of featuredKeys) {
        const item = MarketAPI.getTicker(k);
        if (!item) continue;
        const safeKey = k.replace(/[^a-zA-Z0-9]/g, '');
        try {
          const candles = await MarketAPI.fetchHistoricalCandles(k, "1W");
          const closes = (candles && candles.length > 1) ? candles.map(c => c.close) : null;
          StockChart.drawSparkline(`spark-${safeKey}`, item.change >= 0, closes);
        } catch (e) {
          StockChart.drawSparkline(`spark-${safeKey}`, item.change >= 0);
        }
      }
    }, 150);
  }

  /* ========================================================================
     FEAR & GREED INDEX WIDGET
     ======================================================================== */
  async function initFearGreedWidget() {
    if (typeof MarketAPI === 'undefined' || typeof StockChart === 'undefined' || !document.getElementById("fearGreedCanvas")) return;
    const fg = await MarketAPI.fetchFearGreedIndex();
    const scoreEl = document.getElementById("fearGreedScore");
    const labelEl = document.getElementById("fearGreedLabel");

    if (scoreEl) scoreEl.textContent = fg.score;
    if (labelEl) {
      labelEl.textContent = fg.rating;
      labelEl.style.color = fg.score >= 55 ? "var(--bullish)" : (fg.score <= 45 ? "var(--bearish)" : "var(--neutral)");
    }

    const prevEl = document.getElementById("fgPrevClose");
    const weekEl = document.getElementById("fgOneWeek");
    const monthEl = document.getElementById("fgOneMonth");
    if (prevEl && fg.previousClose) prevEl.textContent = `${fg.previousClose} (${fg.previousRating || 'Greed'})`;
    if (weekEl && fg.oneWeekAgo) weekEl.textContent = `${fg.oneWeekAgo} (${fg.oneWeekRating || 'Greed'})`;
    if (monthEl && fg.oneMonthAgo) monthEl.textContent = `${fg.oneMonthAgo} (${fg.oneMonthRating || 'Neutral'})`;

    setTimeout(() => {
      StockChart.drawFearGreedGauge("fearGreedCanvas", fg.score);
    }, 150);
  }

  /* ========================================================================
     MARKET MOVERS WIDGET (100% REAL DYNAMIC RANKING)
     ======================================================================== */
  function initMoversWidget() {
    const container = document.getElementById("moversList");
    if (!container || typeof MarketAPI === 'undefined') return;

    const all = MarketAPI.getAllTickers();
    // Dynamically rank instruments by actual percentage change magnitude
    const movers = Object.keys(all)
      .map(k => ({ key: k, ...all[k] }))
      .filter(m => m.price > 0)
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, 5);

    container.innerHTML = movers.map(m => {
      const isPos = m.change >= 0;
      return `
        <div class="mover-row" onclick="selectChartTicker('${m.key}')">
          <div class="mover-info">
            <span class="mover-symbol">${m.symbol}</span>
            <span class="mover-name">${m.name}</span>
          </div>
          <div class="mover-values">
            <div class="mover-price">$${m.price.toLocaleString(undefined, { minimumFractionDigits: m.type === 'forex' ? 4 : 2 })}</div>
            <div class="mover-change ${isPos ? 'pos' : 'neg'}">${isPos ? '+' : ''}${m.changePct.toFixed(2)}%</div>
          </div>
        </div>
      `;
    }).join('');
  }

  /* ========================================================================
     CHART CONTROLS
     ======================================================================== */
  /* ========================================================================
     CHART CONTROLS & INSTRUMENT FILTERS
     ======================================================================== */
  window.selectChartTicker = function(tickerKey) {
    if (!tickerKey) return;
    if (typeof StockChart !== 'undefined' && typeof StockChart.loadTicker === 'function') {
      StockChart.loadTicker(tickerKey);
    }

    // Sync dropdown select element
    const instrumentSelect = document.getElementById("chartInstrumentSelect");
    if (instrumentSelect && instrumentSelect.value !== tickerKey) {
      instrumentSelect.value = tickerKey;
    }

    // Sync active state on ticker filter chips
    document.querySelectorAll("[data-chart-ticker]").forEach(chip => {
      if (chip.getAttribute("data-chart-ticker") === tickerKey) {
        chip.classList.add("active");
        try {
          chip.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        } catch (_) {}
      } else {
        chip.classList.remove("active");
      }
    });

    // Check if the selected ticker belongs to a specific category
    if (typeof MarketAPI !== 'undefined' && typeof MarketAPI.getTicker === 'function') {
      const item = MarketAPI.getTicker(tickerKey);
      if (item && item.type) {
        const catName = (item.type === "forex" || item.type === "bond") ? "forex" : item.type;
        const activeCatBtn = document.querySelector("[data-chart-category].active");
        const curCat = activeCatBtn ? activeCatBtn.getAttribute("data-chart-category") : "all";
        // If current active category doesn't include this ticker, switch category to match
        if (curCat !== "all" && curCat !== catName) {
          const matchingCatBtn = document.querySelector(`[data-chart-category="${catName}"]`);
          if (matchingCatBtn) {
            document.querySelectorAll("[data-chart-category]").forEach(b => b.classList.remove("active"));
            matchingCatBtn.classList.add("active");
            if (typeof window.refreshChartChips === 'function') {
              window.refreshChartChips(catName);
            }
          }
        }
      }
    }

    // Only scroll into view if the chart section is not already visible on screen
    const chartSection = document.getElementById("stockChartSection");
    if (chartSection) {
      const rect = chartSection.getBoundingClientRect();
      const inView = rect.top >= -80 && rect.bottom <= (window.innerHeight + 120);
      if (!inView) {
        chartSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  function initChartControls() {
    if (typeof StockChart === 'undefined') return;

    // 1. Timeframe filter buttons
    const tfButtons = document.querySelectorAll("[data-timeframe]");
    tfButtons.forEach(btn => {
      btn.addEventListener("click", function(e) {
        e.preventDefault();
        tfButtons.forEach(b => b.classList.remove("active"));
        this.classList.add("active");
        const tf = this.getAttribute("data-timeframe");
        if (tf) {
          StockChart.setTimeframe(tf);
        }
      });
    });

    // 2. Chart Type (Candle vs Line)
    const candleBtn = document.getElementById("chartBtnCandle");
    const lineBtn = document.getElementById("chartBtnLine");
    if (candleBtn && lineBtn) {
      candleBtn.addEventListener("click", function(e) {
        e.preventDefault();
        candleBtn.classList.add("active");
        lineBtn.classList.remove("active");
        StockChart.setChartType("candlestick");
      });
      lineBtn.addEventListener("click", function(e) {
        e.preventDefault();
        lineBtn.classList.add("active");
        candleBtn.classList.remove("active");
        StockChart.setChartType("line");
      });
    }

    // 3. Header Dropdown Instrument Selector
    const instrumentSelect = document.getElementById("chartInstrumentSelect");
    if (instrumentSelect) {
      instrumentSelect.addEventListener("change", function() {
        selectChartTicker(this.value);
      });
    }

    // 4. Chart Category & Ticker Filter Chips Bar
    initChartInstrumentFilters();
  }

  function initChartInstrumentFilters() {
    const container = document.getElementById("chartTickerChips");
    const categoryBtns = document.querySelectorAll("[data-chart-category]");
    if (!container) return;

    let activeCat = "all";

    function renderTickerChips(cat) {
      const allTickers = (typeof MarketAPI !== 'undefined' && typeof MarketAPI.getAllTickers === 'function')
        ? MarketAPI.getAllTickers()
        : {};
      const keys = Object.keys(allTickers).filter(k => {
        if (cat === "all") return true;
        const item = allTickers[k];
        if (cat === "forex") return item.type === "forex" || item.type === "bond";
        return item.type === cat;
      });

      const currentActive = (typeof StockChart !== 'undefined' && typeof StockChart.getActiveTicker === 'function')
        ? StockChart.getActiveTicker()
        : "^GSPC";

      container.innerHTML = keys.map(k => {
        const item = allTickers[k];
        const isPos = item.change >= 0;
        const isActive = k === currentActive;
        const isFx = item.type === "forex" || k === "EURUSD";
        return `
          <button type="button" class="ticker-filter-chip ${isActive ? 'active' : ''}" data-chart-ticker="${k}">
            <span class="chip-sym">${item.symbol}</span>
            <span class="chip-price tabular-nums">$${item.price.toLocaleString(undefined, { minimumFractionDigits: isFx ? 4 : 2 })}</span>
            <span class="chip-change ${isPos ? 'pos' : 'neg'}">${isPos ? '+' : ''}${item.changePct.toFixed(2)}%</span>
          </button>
        `;
      }).join('');

      container.querySelectorAll("[data-chart-ticker]").forEach(chip => {
        chip.addEventListener("click", function(e) {
          e.preventDefault();
          const tickerKey = this.getAttribute("data-chart-ticker");
          selectChartTicker(tickerKey);
        });
      });
    }

    window.refreshChartChips = renderTickerChips;

    categoryBtns.forEach(btn => {
      btn.addEventListener("click", function(e) {
        e.preventDefault();
        categoryBtns.forEach(b => b.classList.remove("active"));
        this.classList.add("active");
        activeCat = this.getAttribute("data-chart-category");
        renderTickerChips(activeCat);

        // Auto-select first ticker in category if current active ticker is not in this category
        const allTickers = (typeof MarketAPI !== 'undefined' && typeof MarketAPI.getAllTickers === 'function')
          ? MarketAPI.getAllTickers()
          : {};
        const keys = Object.keys(allTickers).filter(k => {
          if (activeCat === "all") return true;
          const item = allTickers[k];
          if (activeCat === "forex") return item.type === "forex" || item.type === "bond";
          return item.type === activeCat;
        });
        const currentActive = (typeof StockChart !== 'undefined' && typeof StockChart.getActiveTicker === 'function')
          ? StockChart.getActiveTicker()
          : "^GSPC";
        if (keys.length > 0 && !keys.includes(currentActive)) {
          selectChartTicker(keys[0]);
        }
      });
    });

    renderTickerChips("all");
  }

  /* ========================================================================
     CATEGORY TABS & ARTICLES FEED
     ======================================================================== */
  function initCategoryTabs() {
    const tabs = document.querySelectorAll(".tab-btn");
    tabs.forEach(tab => {
      tab.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        currentCategory = tab.getAttribute("data-category");
        renderArticlesList();
      });
    });
  }

  /* ========================================================================
     HERO FEATURED STORY DYNAMIC INGESTION
     ======================================================================== */
  function initFeaturedStory() {
    if (typeof ArticlesData === "undefined" || ArticlesData.length === 0) return;
    const hero = ArticlesData[0];
    const heroCard = document.getElementById("heroFeaturedStory");
    if (!heroCard) return;

    heroCard.onclick = () => openArticleModal(hero.id);

    const img = document.getElementById("heroStoryImg");
    if (img && hero.image) {
      img.src = hero.image;
      img.alt = hero.title;
    }

    const cat = document.getElementById("heroCategoryPill");
    if (cat) cat.textContent = hero.category || "US Markets";

    const sent = document.getElementById("heroSentimentPill");
    if (sent) {
      const isBull = hero.sentiment === "Bullish";
      const isBear = hero.sentiment === "Bearish";
      sent.textContent = `${hero.sentiment} ${hero.sentimentScore}`;
      sent.className = `sentiment-pill ${isBull ? 'pos' : (isBear ? 'neg' : 'neutral')}`;
    }

    const timeEl = document.getElementById("heroStoryTime");
    if (timeEl && hero.publishedAt) {
      const pubDate = new Date(hero.publishedAt);
      timeEl.setAttribute("datetime", hero.publishedAt);
      const isToday = pubDate.toDateString() === new Date().toDateString();
      timeEl.textContent = isToday 
        ? `Today, ${pubDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` 
        : pubDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    }

    const readTime = document.getElementById("heroReadTime");
    if (readTime) readTime.textContent = hero.readTime || "5 min read";

    const targetPrice = document.getElementById("heroTargetPrice");
    if (targetPrice && hero.targetPrice) targetPrice.textContent = `Target: ${hero.targetPrice}`;

    const link = document.getElementById("heroStoryLink");
    if (link) {
      link.href = `article.html?id=${encodeURIComponent(hero.id)}`;
      link.textContent = hero.title;
    }

    const excerpt = document.getElementById("heroStoryExcerpt");
    if (excerpt) excerpt.textContent = hero.excerpt;

    const authImg = document.getElementById("heroAuthorImg");
    if (authImg && hero.author && hero.author.avatar) {
      authImg.src = hero.author.avatar;
      authImg.alt = hero.author.name;
    }

    const authName = document.getElementById("heroAuthorName");
    if (authName && hero.author) authName.textContent = hero.author.name;

    const authTitle = document.getElementById("heroAuthorTitle");
    if (authTitle && hero.author) authTitle.textContent = hero.author.title;
  }

  function renderArticlesList() {
    initFeaturedStory();
    const grid = document.getElementById("articlesGrid");
    if (!grid) return;

    let filtered = ArticlesData;
    if (currentCategory !== "all") {
      filtered = ArticlesData.filter(a => a.categorySlug === currentCategory);
    }

    if (filtered.length === 0) {
      grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:3rem; color:var(--text-muted)">No articles found in this category.</div>`;
      return;
    }

    grid.innerHTML = filtered.map(a => {
      const isBull = a.sentiment === "Bullish";
      const isBear = a.sentiment === "Bearish";
      const sentClass = isBull ? "pos" : (isBear ? "neg" : "neutral");
      const articleUrl = `/article/${encodeURIComponent(a.id)}`;

      return `
        <article class="article-card" onclick="if(!event.target.closest('a') && !event.target.closest('button')) window.location.href='${articleUrl}'">
          <div class="card-media">
            <a href="${articleUrl}" aria-label="${a.title}">
              <img class="card-img" src="${a.image}" alt="${a.title}" loading="lazy" width="600" height="340">
            </a>
            <div class="story-floating-badges">
              <span class="category-pill">${a.category}</span>
              <span class="sentiment-pill ${sentClass}">${a.sentiment} ${a.sentimentScore}</span>
            </div>
          </div>
          <div class="card-body">
            <div class="card-meta">
              <span>${new Date(a.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              <span>•</span>
              <span>${a.readTime}</span>
            </div>
            <h3 class="card-title">
              <a href="${articleUrl}" class="card-title-link" style="color:inherit; text-decoration:none;">
                ${a.title}
              </a>
            </h3>
            <p class="card-summary">${a.excerpt}</p>
            <div class="card-tickers">
              ${a.tickers.map(t => `<span class="ticker-tag">${t}</span>`).join('')}
            </div>
            <div class="card-footer" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
              <span>By ${a.author ? a.author.name : 'World Stock News'}</span>
              <div style="display:flex; gap:6px; align-items:center;">
                <button type="button" class="btn-outline" onclick="event.stopPropagation(); openArticleModal('${a.id}')" style="padding:4px 10px; font-size:0.8rem;" title="Quick preview modal">
                  ⚡ Preview
                </button>
                <a href="${articleUrl}" class="read-btn" style="text-decoration:none;">
                  Read Deep Dive →
                </a>
              </div>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  async function syncArticlesFromApi() {
    try {
      const res = await fetch('/api/articles?limit=35');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.articles) && data.articles.length > 0) {
          window.ArticlesData = data.articles;
          renderArticlesList();
        }
      }
    } catch (e) {
      // Graceful fallback to bundled ArticlesData
    }
  }

  /* ========================================================================
     ARTICLE MODAL & DEEP DIVE READER
     ======================================================================== */
  window.openArticleModal = async function(articleId) {
    const modalOverlay = document.getElementById("articleModal");
    const modalContent = document.getElementById("modalArticleContent");
    if (!modalOverlay || !modalContent) return;

    let article = typeof getArticleById === 'function' ? getArticleById(articleId) : null;
    if (!article || (articleId && article.id !== articleId)) {
      try {
        const res = await fetch(`/api/articles?id=${encodeURIComponent(articleId)}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.article) article = json.article;
        }
      } catch (e) {}
    }
    if (!article) {
      article = (typeof ArticlesData !== 'undefined' && ArticlesData.find(a => a.id === articleId)) || (ArticlesData && ArticlesData[0]);
    }
    if (!article) return;

    const sourceUrl = article.sourceUrl || article.link;
    const sourceName = article.source || 'Financial Wire';
    const fullArticleUrl = `/article/${encodeURIComponent(article.id)}`;

    modalContent.innerHTML = `
      <div class="story-media-wrap" style="height:280px; border-radius:var(--radius-md) var(--radius-md) 0 0;">
        <img class="story-image" src="${article.image}" alt="${article.title}">
        <div class="story-floating-badges">
          <span class="category-pill">${article.category}</span>
          <span class="sentiment-pill ${article.sentiment === 'Bullish' ? 'pos' : (article.sentiment === 'Bearish' ? 'neg' : 'neutral')}">
            ${article.sentiment} ${article.sentimentScore}
          </span>
        </div>
      </div>
      <div class="modal-article-wrap">
        <div class="story-meta">
          <span>${new Date(article.publishedAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          <span>•</span>
          <span>${article.readTime}</span>
          <span>•</span>
          <span style="color:var(--bullish); font-weight:700;">Wall St Consensus: ${article.analystConsensus} (${article.targetPrice})</span>
        </div>
        <h1 class="story-title" style="font-size:1.85rem; line-height:1.25; margin:0.75rem 0;">${article.title}</h1>

        ${sourceUrl && (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) ? `
        <div style="margin: 1rem 0; padding: 0.85rem 1rem; background: var(--bg-surface); border: 1px solid var(--border-medium); border-left: 3px solid var(--accent-blue); border-radius: var(--radius-sm); display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div style="font-size:0.85rem; color:var(--text-secondary);">
            📡 <strong>Primary Wire:</strong> Reported by ${sourceName}
          </div>
          <a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="padding:5px 12px; font-size:0.82rem; text-decoration:none; font-weight:700;">
            Read Full Wire on ${sourceName} ↗
          </a>
        </div>` : ''}
        
        <div class="story-footer" style="margin: 1.25rem 0; padding: 0.75rem 0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div class="author-chip">
            <img class="author-avatar" src="${article.author ? article.author.avatar : ''}" alt="${article.author ? article.author.name : ''}">
            <div class="author-info">
              <span class="author-name">${article.author ? article.author.name : 'World Stock News'}</span>
              <span class="author-title">${article.author ? article.author.title : 'Market Strategist'}</span>
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn-outline" onclick="shareArticle('${article.id}', '${article.title.replace(/'/g, "\\'")}')">Share</button>
            <a href="${fullArticleUrl}" class="btn-primary" style="text-decoration:none; font-weight:700;">Open Full Page ↗</a>
          </div>
        </div>

        <div class="modal-article-body">
          ${article.bodyHtml}
        </div>
      </div>
    `;

    modalOverlay.classList.add("active");
    document.body.style.overflow = "hidden";
  };

  function initArticleModal() {
    const modalOverlay = document.getElementById("articleModal");
    const modalClose = document.getElementById("modalCloseBtn");
    if (modalClose && modalOverlay) {
      modalClose.addEventListener("click", () => {
        modalOverlay.classList.remove("active");
        document.body.style.overflow = "";
      });
      modalOverlay.addEventListener("click", (e) => {
        if (e.target === modalOverlay) {
          modalOverlay.classList.remove("active");
          document.body.style.overflow = "";
        }
      });
    }

    document.addEventListener("keydown", (e) => {
      const overlay = document.getElementById("articleModal");
      if (e.key === "Escape" && overlay && overlay.classList.contains("active")) {
        overlay.classList.remove("active");
        document.body.style.overflow = "";
      }
    });
  }

  window.shareArticle = function(id, title) {
    const url = window.location.origin + `/article.html?id=${id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      showToast("Link copied to clipboard!");
    } else {
      showToast("Share URL: " + url);
    }
  };

  /* ========================================================================
     SEARCH MODAL
     ======================================================================== */
  function initSearch() {
    const searchModal = document.getElementById("searchModal");
    const searchInput = document.getElementById("globalSearchInput");
    const searchResults = document.getElementById("searchResultsBox");
    const openBtns = document.querySelectorAll(".trigger-search");
    const closeBtn = document.getElementById("searchModalClose");

    function openSearch() {
      if (searchModal && searchInput) {
        searchModal.classList.add("active");
        searchInput.focus();
        document.body.style.overflow = "hidden";
      }
    }

    function closeSearch() {
      if (searchModal) {
        searchModal.classList.remove("active");
        document.body.style.overflow = "";
      }
    }

    openBtns.forEach(btn => btn.addEventListener("click", openSearch));
    if (closeBtn) closeBtn.addEventListener("click", closeSearch);
    if (searchModal) {
      searchModal.addEventListener("click", (e) => {
        if (e.target === searchModal) closeSearch();
      });
    }

    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        openSearch();
      }
    });

    if (searchInput && searchResults) {
      searchInput.addEventListener("input", (e) => {
        const query = e.target.value.trim().toLowerCase();
        if (!query) {
          searchResults.innerHTML = `<div style="padding:1.5rem; text-align:center; color:var(--text-muted)">Type a ticker (e.g. NVDA, AAPL) or search keywords...</div>`;
          return;
        }

        const matchedArticles = ArticlesData.filter(a => 
          a.title.toLowerCase().includes(query) ||
          a.excerpt.toLowerCase().includes(query) ||
          a.tickers.some(t => t.toLowerCase().includes(query))
        );

        const tickers = MarketAPI.getAllTickers();
        const matchedTickers = Object.keys(tickers).filter(k => 
          k.toLowerCase().includes(query) ||
          tickers[k].name.toLowerCase().includes(query)
        );

        let out = "";

        if (matchedTickers.length > 0) {
          out += `<div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted); margin-bottom:8px;">Matching Financial Instruments</div>`;
          matchedTickers.forEach(k => {
            const t = tickers[k];
            out += `
              <div class="mover-row" onclick="selectChartTicker('${k}'); document.getElementById('searchModal').classList.remove('active'); document.body.style.overflow='';" style="margin-bottom:6px;">
                <div><strong>${t.symbol}</strong> - <span style="color:var(--text-muted)">${t.name}</span></div>
                <div class="tabular-nums font-bold">$${t.price}</div>
              </div>
            `;
          });
        }

        if (matchedArticles.length > 0) {
          out += `<div style="font-size:0.75rem; text-transform:uppercase; color:var(--text-muted); margin:14px 0 8px;">Analysis & News Articles</div>`;
          matchedArticles.forEach(a => {
            out += `
              <div class="mover-row" onclick="openArticleModal('${a.id}'); document.getElementById('searchModal').classList.remove('active'); document.body.style.overflow='';" style="margin-bottom:8px;">
                <div>
                  <div style="font-weight:700; font-size:0.9rem;">${a.title}</div>
                  <div style="font-size:0.75rem; color:var(--text-muted);">${a.category} • ${a.readTime}</div>
                </div>
              </div>
            `;
          });
        }

        if (!out) {
          out = `<div style="padding:1.5rem; text-align:center; color:var(--text-muted)">No matching instruments or articles found for "${query}"</div>`;
        }

        searchResults.innerHTML = out;
      });
    }
  }

  /* ========================================================================
     COMPOUND STOCK INVESTMENT CALCULATOR
     ======================================================================== */
  function initCalculator() {
    const initAmt = document.getElementById("calcInitial");
    const monthlyAmt = document.getElementById("calcMonthly");
    const yearsAmt = document.getElementById("calcYears");
    const returnAmt = document.getElementById("calcReturn");
    const totalOut = document.getElementById("calcTotalValue");
    const interestOut = document.getElementById("calcTotalGains");

    function runCalc() {
      if (!initAmt || !monthlyAmt || !yearsAmt || !returnAmt) return;
      const P = parseFloat(initAmt.value) || 0;
      const PMT = parseFloat(monthlyAmt.value) || 0;
      const t = parseFloat(yearsAmt.value) || 1;
      const r = (parseFloat(returnAmt.value) || 0) / 100;
      const n = 12;

      // Compound formula with monthly contributions
      const futurePrincipal = P * Math.pow(1 + r / n, n * t);
      const futureContributions = r === 0 
        ? PMT * n * t 
        : PMT * ((Math.pow(1 + r / n, n * t) - 1) / (r / n));

      const total = futurePrincipal + futureContributions;
      const totalContributed = P + (PMT * 12 * t);
      const totalGains = Math.max(0, total - totalContributed);

      if (totalOut) totalOut.textContent = "$" + Math.round(total).toLocaleString();
      if (interestOut) interestOut.textContent = "$" + Math.round(totalGains).toLocaleString();
    }

    [initAmt, monthlyAmt, yearsAmt, returnAmt].forEach(inp => {
      if (inp) inp.addEventListener("input", runCalc);
    });
    runCalc();
  }

  /* ========================================================================
     FAQ ACCORDIONS
     ======================================================================== */
  function initFaqAccordions() {
    document.querySelectorAll(".faq-item").forEach(item => {
      const qBtn = item.querySelector(".faq-question");
      if (qBtn) {
        qBtn.addEventListener("click", () => {
          item.classList.toggle("active");
        });
      }
    });
  }

  /* ========================================================================
     NEWSLETTER SUBSCRIPTION
     ======================================================================== */
  function initNewsletter() {
    const form = document.getElementById("newsletterForm");
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = form.querySelector("input[type='email']");
        if (input && input.value) {
          showToast(`Successfully subscribed ${input.value} to Morning Market Brief!`);
          input.value = "";
        }
      });
    }
  }

  /* ========================================================================
     TOAST NOTIFICATIONS
     ======================================================================== */
  window.showToast = function(msg) {
    let toast = document.getElementById("toastNotice");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "toastNotice";
      toast.className = "toast-notice";
      document.body.appendChild(toast);
    }
    toast.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      <span>${msg}</span>
    `;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 3500);
  };

  /* ========================================================================
     DYNAMIC SEO JSON-LD INJECTION
     ======================================================================== */
  function injectDynamicSeoSchema() {
    if (typeof ArticlesData === 'undefined' || !Array.isArray(ArticlesData) || ArticlesData.length === 0) return;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    
    const schemaData = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "NewsMediaOrganization",
          "@id": "https://worldstocknews.online/#organization",
          "name": "World Stock News",
          "url": "https://worldstocknews.online/",
          "logo": {
            "@type": "ImageObject",
            "url": "https://worldstocknews.online/assets/logo.svg",
            "width": 400,
            "height": 80
          },
          "publishingPrinciples": "https://worldstocknews.online/about",
          "sameAs": [
            "https://twitter.com/worldstocknews",
            "https://linkedin.com/company/world-stock-news"
          ]
        },
        {
          "@type": "WebSite",
          "@id": "https://worldstocknews.online/#website",
          "url": "https://worldstocknews.online/",
          "name": "World Stock News - Global Stock Market News & Real-Time Intelligence",
          "publisher": { "@id": "https://worldstocknews.online/#organization" },
          "potentialAction": {
            "@type": "SearchAction",
            "target": "https://worldstocknews.online/?search={search_term_string}",
            "query-input": "required name=search_term_string"
          }
        },
        {
          "@type": "ItemList",
          "itemListElement": ArticlesData.slice(0, 15).map((a, idx) => ({
            "@type": "ListItem",
            "position": idx + 1,
            "url": `https://worldstocknews.online/article/${encodeURIComponent(a.id)}`,
            "name": a.title
          }))
        }
      ]
    };

    script.textContent = JSON.stringify(schemaData);
    document.head.appendChild(script);
  }

  /* ========================================================================
     COOKIE CONSENT & PRIVACY MANAGEMENT
     ======================================================================== */
  function initCookieConsent() {
    // Cookie consent & Google Consent Mode v2 handled globally by js/gdpr-consent.js
  }

  /* ========================================================================
     MOBILE MENU DRAWER & BOTTOM DOCK CONTROLLER
     ======================================================================== */
  function initMobileMenu() {
    const toggleBtn = document.getElementById("mobileMenuToggleBtn");
    const drawer = document.getElementById("mobileNavDrawer");
    const overlay = document.getElementById("mobileDrawerOverlay");
    const closeBtn = document.getElementById("drawerCloseBtn");
    const bnavMenu = document.getElementById("bnav-menu");

    function openDrawer() {
      if (drawer) drawer.classList.add("open");
      if (overlay) overlay.classList.add("open");
      document.body.classList.add("drawer-open");
      if (toggleBtn) {
        toggleBtn.setAttribute("aria-expanded", "true");
        toggleBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      }
    }

    function closeDrawer() {
      if (drawer) drawer.classList.remove("open");
      if (overlay) overlay.classList.remove("open");
      document.body.classList.remove("drawer-open");
      if (toggleBtn) {
        toggleBtn.setAttribute("aria-expanded", "false");
        toggleBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
      }
    }

    if (toggleBtn) {
      toggleBtn.addEventListener("click", () => {
        if (drawer && drawer.classList.contains("open")) {
          closeDrawer();
        } else {
          openDrawer();
        }
      });
    }

    if (bnavMenu) {
      bnavMenu.addEventListener("click", () => {
        if (drawer && drawer.classList.contains("open")) {
          closeDrawer();
        } else {
          openDrawer();
        }
      });
    }

    if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
    if (overlay) overlay.addEventListener("click", closeDrawer);

    if (drawer) {
      drawer.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", closeDrawer);
      });
    }

    // Bottom Navigation Active State Tracking
    const bnavItems = document.querySelectorAll(".bottom-nav-item:not(#bnav-menu)");
    bnavItems.forEach(item => {
      item.addEventListener("click", function() {
        bnavItems.forEach(i => i.classList.remove("active"));
        this.classList.add("active");
      });
    });

    // Update bottom dock active item on scroll
    const sections = [
      { id: "tickerTrack", navId: "bnav-wire" },
      { id: "stockChartSection", navId: "bnav-chart" },
      { id: "articlesFeedSection", navId: "bnav-news" },
      { id: "toolsSection", navId: "bnav-tools" }
    ];

    window.addEventListener("scroll", () => {
      const scrollPos = window.scrollY + 200;
      for (let i = sections.length - 1; i >= 0; i--) {
        const sec = document.getElementById(sections[i].id);
        if (sec && scrollPos >= sec.offsetTop) {
          bnavItems.forEach(i => i.classList.remove("active"));
          const activeNav = document.getElementById(sections[i].navId);
          if (activeNav) activeNav.classList.add("active");
          break;
        }
      }
    }, { passive: true });
  }
});
