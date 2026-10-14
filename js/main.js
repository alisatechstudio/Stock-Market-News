/**
 * World Stock News - Main Application Controller
 * Handles UI interactions, live telemetry, filters, modals, watchlist, calculator, and SEO Schema
 */

document.addEventListener("DOMContentLoaded", () => {
  // Initialize APIs and charting engine
  MarketAPI.init();
  StockChart.init("mainStockCanvas");

  // App State
  let currentCategory = "all";
  let userWatchlist = JSON.parse(localStorage.getItem("mp_watchlist") || '["NVDA", "AAPL", "BTC-USD"]');
  let currentTheme = localStorage.getItem("mp_theme") || "dark";

  // Apply Theme
  applyTheme(currentTheme);

  // Initialize UI Components
  initTickerRibbon();
  initTelemetryCards();
  initFearGreedWidget();
  initMoversWidget();
  initCategoryTabs();
  renderArticlesList();
  initSearch();
  initCalculator();
  initFaqAccordions();
  initNewsletter();
  initArticleModal();
  initChartControls();
  injectDynamicSeoSchema();
  initCookieConsent();
  initMobileMenu();
  initBreakingNewsWire();

  // Listen to live price updates from MarketAPI
  MarketAPI.subscribe((key, data) => {
    updateTickerElement(key, data);
    initMoversWidget();
    StockChart.onPriceTick(key, data);
  });

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
    // Re-render chart for proper colors
    setTimeout(() => {
      StockChart.render();
      const fg = MarketAPI.getFearGreedIndex();
      StockChart.drawFearGreedGauge("fearGreedCanvas", fg.score);
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
    if (!track) return;

    const tickers = MarketAPI.getAllTickers();
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
  }

  /* ========================================================================
     MARKET TELEMETRY CARDS (TOP INDICES)
     ======================================================================== */
  function initTelemetryCards() {
    const grid = document.getElementById("telemetryGrid");
    if (!grid) return;

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
    if (!container) return;

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
  function initChartControls() {
    // Timeframe buttons
    document.querySelectorAll("[data-timeframe]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll("[data-timeframe]").forEach(b => b.classList.remove("active"));
        e.currentTarget.classList.add("active");
        const tf = e.currentTarget.getAttribute("data-timeframe");
        StockChart.setTimeframe(tf);
      });
    });

    // Chart Type (Candle vs Line)
    const candleBtn = document.getElementById("chartBtnCandle");
    const lineBtn = document.getElementById("chartBtnLine");
    if (candleBtn && lineBtn) {
      candleBtn.addEventListener("click", () => {
        candleBtn.classList.add("active");
        lineBtn.classList.remove("active");
        StockChart.setChartType("candlestick");
      });
      lineBtn.addEventListener("click", () => {
        lineBtn.classList.add("active");
        candleBtn.classList.remove("active");
        StockChart.setChartType("line");
      });
    }
  }

  window.selectChartTicker = function(tickerKey) {
    StockChart.loadTicker(tickerKey);
    const chartSection = document.getElementById("stockChartSection");
    if (chartSection) {
      chartSection.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

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

  function renderArticlesList() {
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

      return `
        <article class="article-card" onclick="openArticleModal('${a.id}')">
          <div class="card-media">
            <img class="card-img" src="${a.image}" alt="${a.title}" loading="lazy" width="600" height="340">
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
            <h3 class="card-title">${a.title}</h3>
            <p class="card-summary">${a.excerpt}</p>
            <div class="card-tickers">
              ${a.tickers.map(t => `<span class="ticker-tag">${t}</span>`).join('')}
            </div>
            <div class="card-footer">
              <span>By ${a.author.name}</span>
              <span class="read-btn">Read Deep Dive →</span>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  /* ========================================================================
     ARTICLE MODAL & DEEP DIVE READER
     ======================================================================== */
  const modalOverlay = document.getElementById("articleModal");
  const modalContent = document.getElementById("modalArticleContent");
  const modalClose = document.getElementById("modalCloseBtn");

  window.openArticleModal = function(articleId) {
    const article = getArticleById(articleId);
    if (!article || !modalOverlay || !modalContent) return;

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
        <h1 class="story-title" style="font-size:2rem;">${article.title}</h1>
        
        <div class="story-footer" style="margin: 1.5rem 0; padding: 1rem 0;">
          <div class="author-chip">
            <img class="author-avatar" src="${article.author.avatar}" alt="${article.author.name}">
            <div class="author-info">
              <span class="author-name">${article.author.name}</span>
              <span class="author-title">${article.author.title}</span>
            </div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn-outline" onclick="shareArticle('${article.id}', '${article.title.replace(/'/g, "\\'")}')">Share</button>
            <a href="article.html?id=${article.id}" class="btn-primary" style="text-decoration:none;">Open Full Page ↗</a>
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
      if (e.key === "Escape" && modalOverlay && modalOverlay.classList.contains("active")) {
        modalOverlay.classList.remove("active");
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
            "url": "https://worldstocknews.online/assets/logo.png",
            "width": 600,
            "height": 60
          },
          "publishingPrinciples": "https://worldstocknews.online/editorial-guidelines",
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
          "itemListElement": ArticlesData.map((a, idx) => ({
            "@type": "ListItem",
            "position": idx + 1,
            "url": `https://worldstocknews.online/article.html?id=${a.id}`,
            "name": a.title
          }))
        }
      ]
    };

    script.textContent = JSON.stringify(schemaData);
    document.head.appendChild(script);
  }

  /* ========================================================================
     COOKIE CONSENT BANNER (GDPR / CCPA / GOOGLE EU USER CONSENT)
     ======================================================================== */
  function initCookieConsent() {
    if (localStorage.getItem("mp_cookie_consent")) return;

    const banner = document.createElement("div");
    banner.className = "cookie-consent-banner";
    banner.id = "cookieConsentBanner";
    banner.innerHTML = `
      <div class="cookie-content">
        <strong>Privacy &amp; Advertising Notice:</strong> We and our third-party advertising partners (including Google AdSense) use cookies and web beacons to personalize financial content, display relevant ads, and analyze traffic. Review our <a href="privacy-policy.html">Privacy Policy</a> to learn how your data is handled.
      </div>
      <div class="cookie-actions">
        <button class="btn-outline" style="padding:6px 14px; font-size:0.8rem;" id="cookieRejectBtn">Essential Only</button>
        <button class="btn-primary" style="padding:6px 16px; font-size:0.8rem;" id="cookieAcceptBtn">Accept All</button>
      </div>
    `;

    document.body.appendChild(banner);

    document.getElementById("cookieAcceptBtn").addEventListener("click", () => {
      localStorage.setItem("mp_cookie_consent", "all");
      banner.remove();
      showToast("Cookie preferences saved.");
    });

    document.getElementById("cookieRejectBtn").addEventListener("click", () => {
      localStorage.setItem("mp_cookie_consent", "essential");
      banner.remove();
      showToast("Only essential cookies enabled.");
    });
  }

  /* ========================================================================
     MOBILE MENU DRAWER CONTROLLER
     ======================================================================== */
  function initMobileMenu() {
    const toggleBtn = document.getElementById("mobileMenuToggleBtn");
    const drawer = document.getElementById("mobileNavDrawer");
    if (!toggleBtn || !drawer) return;

    toggleBtn.addEventListener("click", () => {
      const isOpen = drawer.classList.toggle("open");
      toggleBtn.setAttribute("aria-expanded", isOpen);
      toggleBtn.innerHTML = isOpen
        ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
        : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
    });

    drawer.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => {
        drawer.classList.remove("open");
        toggleBtn.setAttribute("aria-expanded", "false");
        toggleBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`;
      });
    });
  }
});
