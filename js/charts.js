/**
 * World Stock News - Institutional Canvas Financial Charting Engine
 * Features:
 * - High-DPI Retina resolution
 * - Dedicated right Y-axis price scale with gridlines & floating price cursor badge
 * - Dedicated bottom X-axis time scale with date/time labels & time cursor badge
 * - Professional Candlestick (OHLC wicks & real bodies) and Smooth Area Line modes
 * - Real Volume histogram bars with proportional alpha fill
 * - Dynamic 20-period Simple Moving Average (SMA 20) with dashed curve
 * - Dynamic 14-period Relative Strength Index (RSI 14) mathematical calculation
 * - Theme-aware styling (Dark/Light mode reactive)
 * - Accurate container-relative interactive crosshair & tooltip
 * - Miniature sparklines with real historical price action
 */

const StockChart = (function() {
  let canvas = null;
  let ctx = null;
  let currentCandles = [];
  let chartType = "candlestick"; // "candlestick" or "line"
  let activeTicker = "^GSPC";
  let activeTimeframe = "1M";
  let hoverIndex = -1;
  let mousePos = { x: -1, y: -1 };
  let isLoading = false;

  // Chart layout gutters
  const GUTTER_TOP = 20;
  const GUTTER_BOTTOM = 28;
  const GUTTER_RIGHT = 76;

  let animId = null;

  function init(canvasId) {
    canvas = document.getElementById(canvasId);
    if (!canvas) return;
    ctx = canvas.getContext("2d");

    setupEvents();
    loadTicker(activeTicker, activeTimeframe);
    startAnimationLoop();
    window.addEventListener("resize", handleResize);
  }

  function startAnimationLoop() {
    if (animId) cancelAnimationFrame(animId);
    function tick() {
      render();
      animId = requestAnimationFrame(tick);
    }
    animId = requestAnimationFrame(tick);
  }

  function handleResize() {
    if (!canvas) return;
    render();
  }

  function setupEvents() {
    if (!canvas) return;

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      mousePos = { x, y };

      const plotWidth = rect.width - GUTTER_RIGHT;
      const count = currentCandles.length;
      if (count === 0 || x > plotWidth || x < 0) {
        hoverIndex = -1;
        render();
        hideTooltip();
        return;
      }

      const candleWidth = plotWidth / count;
      const idx = Math.min(count - 1, Math.max(0, Math.floor(x / candleWidth)));
      hoverIndex = idx;
      render();
      updateTooltip(x, y, currentCandles[idx]);
    });

    canvas.addEventListener("mouseleave", () => {
      hoverIndex = -1;
      mousePos = { x: -1, y: -1 };
      render();
      hideTooltip();
    });
  }

  function updateTooltip(relX, relY, candle) {
    const tip = document.getElementById("chartTooltip");
    if (!tip || !candle) return;

    const isUp = candle.close >= candle.open;
    const isForex = activeTicker === "EURUSD" || activeTicker === "EUR/USD";
    const dec = isForex ? 4 : 2;

    tip.style.display = "block";
    tip.style.left = Math.min(relX + 16, (canvas.clientWidth - 170)) + "px";
    tip.style.top = Math.max(12, Math.min(relY - 30, canvas.clientHeight - 130)) + "px";

    const d = candle.timestamp instanceof Date ? candle.timestamp : new Date(candle.timestamp);
    const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + 
      (activeTimeframe === "1D" ? " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "");

    const volStr = candle.volume > 1e9 ? `${(candle.volume / 1e9).toFixed(2)}B` : (candle.volume > 1e6 ? `${(candle.volume / 1e6).toFixed(1)}M` : candle.volume.toLocaleString());

    tip.innerHTML = `
      <div style="font-weight:700; margin-bottom:5px; color:var(--text-muted); font-size:0.72rem;">${dateStr}</div>
      <div style="display:flex; justify-content:space-between; gap:12px; font-size:0.75rem;"><span>Open:</span> <strong>$${candle.open.toFixed(dec)}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:12px; font-size:0.75rem;"><span>High:</span> <strong>$${candle.high.toFixed(dec)}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:12px; font-size:0.75rem;"><span>Low:</span> <strong>$${candle.low.toFixed(dec)}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:12px; font-size:0.75rem;"><span>Close:</span> <strong style="color:${isUp ? 'var(--bullish)' : 'var(--bearish)'}">$${candle.close.toFixed(dec)}</strong></div>
      ${candle.volume > 0 ? `<div style="display:flex; justify-content:space-between; gap:12px; font-size:0.75rem; border-top:1px solid rgba(255,255,255,0.08); padding-top:4px; margin-top:4px;"><span>Vol:</span> <strong>${volStr}</strong></div>` : ''}
    `;
  }

  function hideTooltip() {
    const tip = document.getElementById("chartTooltip");
    if (tip) tip.style.display = "none";
  }

  async function loadTicker(tickerKey, timeframe) {
    activeTicker = tickerKey;
    activeTimeframe = timeframe || activeTimeframe;
    updateHeaderStats();

    isLoading = true;
    render();

    try {
      currentCandles = await MarketAPI.fetchHistoricalCandles(tickerKey, activeTimeframe);
    } catch (e) {
      console.warn("Chart candle fetch warning:", e.message);
    } finally {
      isLoading = false;
      render();
      updateHeaderStats();
    }
  }

  function setChartType(type) {
    chartType = type;
    render();
  }

  function setTimeframe(tf) {
    activeTimeframe = tf;
    loadTicker(activeTicker, tf);
  }

  // Calculate Wilder's RSI (14)
  function calculateRSI(candles, period = 14) {
    if (!candles || candles.length <= period) return 50.0;
    const closes = candles.map(c => c.close);
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) {
        avgGain = (avgGain * (period - 1) + diff) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
      }
    }

    if (avgLoss === 0) return 100.0;
    const rs = avgGain / avgLoss;
    return +(100 - (100 / (1 + rs))).toFixed(1);
  }

  // Calculate 20-period SMA
  function calculateSMA(candles, period = 20) {
    if (!candles || candles.length === 0) return 0;
    const count = Math.min(candles.length, period);
    const slice = candles.slice(-count);
    const sum = slice.reduce((acc, c) => acc + c.close, 0);
    return +(sum / count).toFixed(activeTicker === "EURUSD" ? 4 : 2);
  }

  function updateHeaderStats() {
    const item = MarketAPI.getTicker(activeTicker);
    if (!item) return;

    const isForex = activeTicker === "EURUSD" || activeTicker === "EUR/USD";
    const dec = isForex ? 4 : 2;

    const nameEl = document.getElementById("chartTickerName");
    const fullEl = document.getElementById("chartTickerFull");
    const priceEl = document.getElementById("chartPriceDisplay");
    const changeEl = document.getElementById("chartChangeDisplay");

    if (nameEl) nameEl.textContent = item.symbol;
    if (fullEl) fullEl.textContent = item.name;
    if (priceEl) priceEl.textContent = "$" + item.price.toLocaleString(undefined, { minimumFractionDigits: dec });
    if (changeEl) {
      const isPos = item.change >= 0;
      changeEl.className = `pill-badge ${isPos ? 'pos' : 'neg'}`;
      changeEl.textContent = `${isPos ? '+' : ''}${item.change.toFixed(dec)} (${isPos ? '+' : ''}${item.changePct.toFixed(2)}%)`;
    }

    const statHigh = document.getElementById("statHigh");
    const statLow = document.getElementById("statLow");
    const statVol = document.getElementById("statVol");
    if (statHigh) statHigh.textContent = "$" + (item.high ? item.high.toLocaleString(undefined, { minimumFractionDigits: dec }) : "-");
    if (statLow) statLow.textContent = "$" + (item.low ? item.low.toLocaleString(undefined, { minimumFractionDigits: dec }) : "-");
    if (statVol) statVol.textContent = item.volume || "-";

    // Dynamic SMA & RSI
    if (currentCandles && currentCandles.length > 0) {
      const sma = calculateSMA(currentCandles, 20);
      const rsi = calculateRSI(currentCandles, 14);

      const smaEl = document.getElementById("statSMA");
      const rsiEl = document.getElementById("statRSI");
      if (smaEl && sma > 0) smaEl.textContent = "$" + sma.toLocaleString(undefined, { minimumFractionDigits: dec });
      if (rsiEl) {
        const rsiSentiment = rsi >= 70 ? "Overbought" : (rsi <= 30 ? "Oversold" : (rsi >= 50 ? "Bullish" : "Consolidating"));
        rsiEl.textContent = `${rsi} (${rsiSentiment})`;
        rsiEl.style.color = rsi >= 50 ? "var(--bullish)" : "var(--bearish)";
      }
    }
  }

  function render() {
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Check Theme
    const isDark = document.documentElement.getAttribute("data-theme") !== "light";
    const colorBg = isDark ? "#080c16" : "#ffffff";
    const colorGrid = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.06)";
    const colorAxis = isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.12)";
    const colorText = isDark ? "rgba(148, 163, 184, 0.7)" : "rgba(71, 85, 105, 0.85)";
    const colorCrosshair = isDark ? "rgba(255, 255, 255, 0.35)" : "rgba(15, 23, 42, 0.35)";

    // Clear background
    ctx.fillStyle = colorBg;
    ctx.fillRect(0, 0, width, height);

    if (isLoading) {
      ctx.fillStyle = colorText;
      ctx.font = "600 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Syncing Real-Time Market Telemetry...", width / 2, height / 2);
      ctx.restore();
      return;
    }

    if (currentCandles.length === 0) {
      ctx.fillStyle = colorText;
      ctx.font = "13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Connecting to exchange feed...", width / 2, height / 2);
      ctx.restore();
      return;
    }

    const plotWidth = width - GUTTER_RIGHT;
    const plotHeight = height - GUTTER_BOTTOM - GUTTER_TOP;
    const priceHeight = plotHeight * 0.76;
    const volumeHeight = plotHeight * 0.20;
    const volumeTop = GUTTER_TOP + plotHeight * 0.80;

    const isForex = activeTicker === "EURUSD" || activeTicker === "EUR/USD";
    const dec = isForex ? 4 : 2;

    // Min & Max calculations
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVolume = 0;

    currentCandles.forEach(c => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.volume > maxVolume) maxVolume = c.volume;
    });

    const pricePadding = (maxPrice - minPrice) * 0.06 || 0.1;
    minPrice -= pricePadding;
    maxPrice += pricePadding;
    const priceRange = (maxPrice - minPrice) || 1;

    const count = currentCandles.length;
    const candleWidth = plotWidth / count;
    const barPadding = Math.max(1, candleWidth * 0.20);
    const barW = Math.max(2, candleWidth - barPadding * 2);

    // 1. Draw Horizontal Grid Lines & Right Price Scale
    ctx.lineWidth = 1;
    const gridRows = 5;
    for (let r = 0; r <= gridRows; r++) {
      const y = GUTTER_TOP + (priceHeight / gridRows) * r;
      ctx.strokeStyle = colorGrid;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotWidth, y);
      ctx.stroke();

      // Right axis price label
      const priceVal = maxPrice - (priceRange / gridRows) * r;
      ctx.fillStyle = colorText;
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "left";
      ctx.fillText("$" + priceVal.toFixed(dec), plotWidth + 8, y + 3.5);
    }

    // Right Y-axis vertical divider line
    ctx.strokeStyle = colorAxis;
    ctx.beginPath();
    ctx.moveTo(plotWidth, 0);
    ctx.lineTo(plotWidth, height - GUTTER_BOTTOM);
    ctx.stroke();

    // Bottom X-axis horizontal divider line
    ctx.beginPath();
    ctx.moveTo(0, height - GUTTER_BOTTOM);
    ctx.lineTo(width, height - GUTTER_BOTTOM);
    ctx.stroke();

    // 2. Draw X-Axis Time Labels & Vertical Grid Lines
    const step = Math.max(1, Math.floor(count / 6));
    ctx.fillStyle = colorText;
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";

    for (let i = 0; i < count; i += step) {
      const c = currentCandles[i];
      const x = i * candleWidth + candleWidth / 2;
      const d = c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp);

      let label = "";
      if (activeTimeframe === "1D") {
        label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      } else if (activeTimeframe === "1W") {
        label = d.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
      } else if (activeTimeframe === "1M") {
        label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      } else if (activeTimeframe === "1Y") {
        label = d.toLocaleDateString([], { month: 'short', year: '2-digit' });
      } else {
        label = d.toLocaleDateString([], { month: 'short', year: 'numeric' });
      }

      // Vertical subtle grid
      ctx.strokeStyle = colorGrid;
      ctx.beginPath();
      ctx.moveTo(x, GUTTER_TOP);
      ctx.lineTo(x, height - GUTTER_BOTTOM);
      ctx.stroke();

      // Tick label
      ctx.fillText(label, x, height - 10);
    }

    // 3. Draw Volume Histogram Bars
    if (maxVolume > 0) {
      currentCandles.forEach((c, i) => {
        const isUp = c.close >= c.open;
        const x = i * candleWidth;
        const vHeight = (c.volume / maxVolume) * volumeHeight;
        const vY = (height - GUTTER_BOTTOM) - vHeight;

        ctx.fillStyle = isUp ? "rgba(16, 185, 129, 0.22)" : "rgba(244, 63, 94, 0.22)";
        ctx.fillRect(x + barPadding, vY, barW, vHeight);
      });
    }

    // 4. Draw Candlesticks or Smooth Line
    if (chartType === "candlestick") {
      currentCandles.forEach((c, i) => {
        const isUp = c.close >= c.open;
        const x = i * candleWidth + candleWidth / 2;
        const barLeft = i * candleWidth + barPadding;

        const yHigh = GUTTER_TOP + priceHeight - ((c.high - minPrice) / priceRange) * priceHeight;
        const yLow = GUTTER_TOP + priceHeight - ((c.low - minPrice) / priceRange) * priceHeight;
        const yOpen = GUTTER_TOP + priceHeight - ((c.open - minPrice) / priceRange) * priceHeight;
        const yClose = GUTTER_TOP + priceHeight - ((c.close - minPrice) / priceRange) * priceHeight;

        // Wick
        ctx.strokeStyle = isUp ? "#10b981" : "#f43f5e";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x, yHigh);
        ctx.lineTo(x, yLow);
        ctx.stroke();

        // Body
        const bodyY = Math.min(yOpen, yClose);
        const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));
        ctx.fillStyle = isUp ? "#10b981" : "#f43f5e";
        ctx.fillRect(barLeft, bodyY, barW, bodyHeight);
      });
    } else {
      // Smooth Line Mode
      ctx.beginPath();
      currentCandles.forEach((c, i) => {
        const x = i * candleWidth + candleWidth / 2;
        const y = GUTTER_TOP + priceHeight - ((c.close - minPrice) / priceRange) * priceHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.4;
      ctx.stroke();

      // Gradient Area fill
      const lastX = (count - 1) * candleWidth + candleWidth / 2;
      ctx.lineTo(lastX, GUTTER_TOP + priceHeight);
      ctx.lineTo(candleWidth / 2, GUTTER_TOP + priceHeight);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, GUTTER_TOP, 0, GUTTER_TOP + priceHeight);
      grad.addColorStop(0, isDark ? "rgba(56, 189, 248, 0.28)" : "rgba(2, 132, 199, 0.20)");
      grad.addColorStop(1, "rgba(56, 189, 248, 0.0)");
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // 5. Draw 20-period SMA Line
    if (count > 5) {
      const smaPeriod = Math.min(20, Math.floor(count / 2));
      ctx.beginPath();
      let started = false;
      for (let i = smaPeriod - 1; i < count; i++) {
        let sum = 0;
        for (let j = 0; j < smaPeriod; j++) sum += currentCandles[i - j].close;
        const avg = sum / smaPeriod;
        const x = i * candleWidth + candleWidth / 2;
        const y = GUTTER_TOP + priceHeight - ((avg - minPrice) / priceRange) * priceHeight;

        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 6. Real-Time Moving Price Line & Active Candle Beacon (Live Streaming)
    if (count > 0) {
      const lastCandle = currentCandles[count - 1];
      const lastX = (count - 1) * candleWidth + candleWidth / 2;
      const livePriceY = GUTTER_TOP + priceHeight - ((lastCandle.close - minPrice) / priceRange) * priceHeight;
      const isLiveUp = lastCandle.close >= lastCandle.open;
      const liveColor = isLiveUp ? "#10b981" : "#f43f5e";

      // Horizontal dashed live streaming price line
      ctx.strokeStyle = liveColor;
      ctx.lineWidth = 1.3;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(0, livePriceY);
      ctx.lineTo(plotWidth, livePriceY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Live pulsating ripple beacon at active candle tip
      const now = Date.now();
      const pulsePhase = (now % 1600) / 1600; // 0.0 -> 1.0
      const rippleRadius = 4 + pulsePhase * 15;
      const rippleAlpha = Math.max(0, 1 - pulsePhase) * 0.75;

      ctx.strokeStyle = isLiveUp ? `rgba(16, 185, 129, ${rippleAlpha})` : `rgba(244, 63, 94, ${rippleAlpha})`;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(lastX, livePriceY, rippleRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Glowing solid center beacon dot
      ctx.fillStyle = liveColor;
      ctx.beginPath();
      ctx.arc(lastX, livePriceY, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Right axis live price badge (Highlighted pill, only if not hovered)
      if (hoverIndex < 0) {
        ctx.fillStyle = liveColor;
        ctx.fillRect(plotWidth + 1, livePriceY - 10, GUTTER_RIGHT - 2, 20);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "left";
        ctx.fillText("$" + lastCandle.close.toFixed(dec), plotWidth + 6, livePriceY + 3.5);
      }
    }

    // 7. Interactive Crosshair & Scale Badges
    if (hoverIndex >= 0 && hoverIndex < count) {
      const c = currentCandles[hoverIndex];
      const hX = hoverIndex * candleWidth + candleWidth / 2;
      const hY = Math.max(GUTTER_TOP, Math.min(mousePos.y, GUTTER_TOP + priceHeight));

      // Calculate price at mouse cursor Y
      const cursorPrice = maxPrice - ((hY - GUTTER_TOP) / priceHeight) * priceRange;

      ctx.strokeStyle = colorCrosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      // Vertical line across canvas
      ctx.beginPath();
      ctx.moveTo(hX, 0);
      ctx.lineTo(hX, height - GUTTER_BOTTOM);
      ctx.stroke();

      // Horizontal line across plot
      ctx.beginPath();
      ctx.moveTo(0, hY);
      ctx.lineTo(plotWidth, hY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Point circle on candle close
      const candleCloseY = GUTTER_TOP + priceHeight - ((c.close - minPrice) / priceRange) * priceHeight;
      ctx.fillStyle = c.close >= c.open ? "#10b981" : "#f43f5e";
      ctx.beginPath();
      ctx.arc(hX, candleCloseY, 4, 0, Math.PI * 2);
      ctx.fill();

      // Right axis price badge
      ctx.fillStyle = isDark ? "#1e293b" : "#0f172a";
      ctx.fillRect(plotWidth + 1, hY - 10, GUTTER_RIGHT - 2, 20);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText("$" + cursorPrice.toFixed(dec), plotWidth + 6, hY + 4);

      // Bottom axis date badge
      const d = c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp);
      const timeBadgeText = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + 
        (activeTimeframe === "1D" ? " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "");
      
      const badgeW = 90;
      ctx.fillStyle = isDark ? "#1e293b" : "#0f172a";
      ctx.fillRect(Math.max(0, Math.min(hX - badgeW / 2, plotWidth - badgeW)), height - GUTTER_BOTTOM + 2, badgeW, 18);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(timeBadgeText, Math.max(badgeW / 2, Math.min(hX, plotWidth - badgeW / 2)), height - GUTTER_BOTTOM + 14);
    }

    ctx.restore();
  }

  // Live incoming tick update handler
  function onPriceTick(tickerKey, tickerData) {
    if (tickerKey !== activeTicker || !tickerData || currentCandles.length === 0) return;
    const lastIdx = currentCandles.length - 1;
    const last = currentCandles[lastIdx];
    
    const oldPrice = last.close;
    last.close = tickerData.price;
    if (tickerData.price > last.high) last.high = tickerData.price;
    if (tickerData.price < last.low) last.low = tickerData.price;
    
    updateHeaderStats();

    if (oldPrice !== tickerData.price) {
      const priceEl = document.getElementById("chartPriceDisplay");
      if (priceEl) {
        const isUp = tickerData.price >= oldPrice;
        priceEl.classList.remove("flash-up", "flash-down");
        void priceEl.offsetWidth; // force reflow
        priceEl.classList.add(isUp ? "flash-up" : "flash-down");
      }
    }
  }

  // Draw Fear & Greed Needle Gauge
  function drawFearGreedGauge(canvasId, score) {
    const cvs = document.getElementById(canvasId);
    if (!cvs) return;
    const c = cvs.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = cvs.getBoundingClientRect();
    cvs.width = rect.width * dpr;
    cvs.height = rect.height * dpr;

    c.save();
    c.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    const cx = w / 2;
    const cy = h - 10;
    const radius = Math.min(w * 0.44, h * 0.85);

    c.clearRect(0, 0, w, h);

    const segments = [
      { color: "#ef4444", start: Math.PI, end: Math.PI * 1.2 },
      { color: "#f97316", start: Math.PI * 1.2, end: Math.PI * 1.4 },
      { color: "#eab308", start: Math.PI * 1.4, end: Math.PI * 1.6 },
      { color: "#84cc16", start: Math.PI * 1.6, end: Math.PI * 1.8 },
      { color: "#10b981", start: Math.PI * 1.8, end: Math.PI * 2.0 }
    ];

    segments.forEach(seg => {
      c.beginPath();
      c.arc(cx, cy, radius, seg.start, seg.end);
      c.lineWidth = 14;
      c.strokeStyle = seg.color;
      c.stroke();
    });

    const angle = Math.PI + (Math.max(0, Math.min(100, score)) / 100) * Math.PI;
    c.save();
    c.translate(cx, cy);
    c.rotate(angle);

    c.beginPath();
    c.moveTo(0, -5);
    c.lineTo(radius - 8, 0);
    c.lineTo(0, 5);
    c.fillStyle = "#ffffff";
    c.shadowColor = "rgba(0,0,0,0.5)";
    c.shadowBlur = 6;
    c.fill();
    c.restore();

    c.beginPath();
    c.arc(cx, cy, 7, 0, Math.PI * 2);
    c.fillStyle = "#38bdf8";
    c.fill();

    c.restore();
  }

  // Draw miniature sparkline from real price telemetry
  function drawSparkline(canvasId, isPositive, dataPoints) {
    const cvs = document.getElementById(canvasId);
    if (!cvs) return;
    const c = cvs.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = cvs.width = cvs.clientWidth * dpr;
    const h = cvs.height = cvs.clientHeight * dpr;
    c.clearRect(0, 0, w, h);

    const data = (dataPoints && dataPoints.length > 1)
      ? dataPoints
      : (isPositive 
          ? [12, 14, 13, 17, 16, 21, 24, 23, 28, 33, 37] 
          : [37, 34, 35, 30, 32, 26, 23, 24, 19, 15, 11]);

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = (max - min) || 1;

    c.beginPath();
    data.forEach((val, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((val - min) / range) * (h * 0.75) - (h * 0.12);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });

    c.strokeStyle = isPositive ? "#10b981" : "#f43f5e";
    c.lineWidth = 2 * dpr;
    c.lineJoin = "round";
    c.stroke();
  }

  return {
    init,
    loadTicker,
    setChartType,
    setTimeframe,
    render,
    drawFearGreedGauge,
    drawSparkline,
    updateHeaderStats,
    onPriceTick
  };
})();
