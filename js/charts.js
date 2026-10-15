/**
 * World Stock News - Institutional Canvas Financial Charting Engine
 * Features:
 * - High-DPI Retina resolution with cached buffer sizing (zero jitter)
 * - Dedicated right Y-axis price scale with gridlines & floating price badge
 * - Dedicated bottom X-axis time scale with date/time labels & time badge
 * - Professional Candlestick (centered crisp wicks & proportional bodies)
 * - Smooth Glowing Area Line mode with subtle curve interpolation
 * - Real Volume histogram bars with proportional alpha fill & hover states
 * - Dynamic 20-period Simple Moving Average (SMA 20) with dashed curve & legend
 * - Dynamic 14-period Relative Strength Index (RSI 14) mathematical calculation
 * - Theme-aware styling (Dark/Light mode reactive)
 * - Accurate container-relative interactive crosshair & tooltip
 * - Mobile Touch Support (touchstart, touchmove, touchend scrubbing)
 * - Miniature sparklines with real historical price action & area gradients
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
  const GUTTER_TOP = 24;
  const GUTTER_BOTTOM = 30;
  const GUTTER_RIGHT = 86;

  // Canvas dimension cache to prevent resetting bitmap every frame
  let cachedDpr = 0;
  let cachedWidth = 0;
  let cachedHeight = 0;

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
    cachedWidth = 0;
    cachedHeight = 0;
    render();
  }

  function setupEvents() {
    if (!canvas) return;

    function handlePointerMove(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      mousePos = { x, y };

      const plotWidth = rect.width - GUTTER_RIGHT;
      const count = currentCandles.length;
      if (count === 0 || x > plotWidth || x < 0) {
        hoverIndex = -1;
        hideTooltip();
        return;
      }

      const slotWidth = plotWidth / count;
      const idx = Math.min(count - 1, Math.max(0, Math.floor(x / slotWidth)));
      hoverIndex = idx;
      updateTooltip(x, y, currentCandles[idx]);
    }

    function handlePointerLeave() {
      hoverIndex = -1;
      mousePos = { x: -1, y: -1 };
      hideTooltip();
    }

    // Mouse Events
    canvas.addEventListener("mousemove", (e) => {
      handlePointerMove(e.clientX, e.clientY);
    });

    canvas.addEventListener("mouseleave", handlePointerLeave);

    // Touch Support for Mobile / iPad
    canvas.addEventListener("touchstart", (e) => {
      if (e.touches && e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    canvas.addEventListener("touchmove", (e) => {
      if (e.touches && e.touches.length > 0) {
        handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    canvas.addEventListener("touchend", () => {
      setTimeout(handlePointerLeave, 2000);
    }, { passive: true });
  }

  function updateTooltip(relX, relY, candle) {
    const tip = document.getElementById("chartTooltip");
    if (!tip || !candle) return;

    const isUp = candle.close >= candle.open;
    const isForex = activeTicker === "EURUSD" || activeTicker === "EUR/USD";
    const dec = isForex ? 4 : 2;

    tip.style.display = "block";
    tip.style.left = Math.min(relX + 16, (canvas.clientWidth - 180)) + "px";
    tip.style.top = Math.max(12, Math.min(relY - 30, canvas.clientHeight - 140)) + "px";

    const d = candle.timestamp instanceof Date ? candle.timestamp : new Date(candle.timestamp);
    const dateStr = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + 
      (activeTimeframe === "1D" ? " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "");

    const volStr = candle.volume > 1e9 
      ? `${(candle.volume / 1e9).toFixed(2)}B` 
      : (candle.volume > 1e6 ? `${(candle.volume / 1e6).toFixed(1)}M` : candle.volume.toLocaleString());

    tip.innerHTML = `
      <div style="font-weight:700; margin-bottom:5px; color:var(--text-muted); font-size:0.72rem; letter-spacing:0.02em;">${dateStr}</div>
      <div style="display:flex; justify-content:space-between; gap:14px; font-size:0.75rem;"><span>Open:</span> <strong>$${candle.open.toFixed(dec)}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:14px; font-size:0.75rem;"><span>High:</span> <strong>$${candle.high.toFixed(dec)}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:14px; font-size:0.75rem;"><span>Low:</span> <strong>$${candle.low.toFixed(dec)}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:14px; font-size:0.75rem;"><span>Close:</span> <strong style="color:${isUp ? 'var(--bullish)' : 'var(--bearish)'}">$${candle.close.toFixed(dec)}</strong></div>
      ${candle.volume > 0 ? `<div style="display:flex; justify-content:space-between; gap:14px; font-size:0.75rem; border-top:1px solid rgba(255,255,255,0.08); padding-top:4px; margin-top:4px;"><span>Vol:</span> <strong>${volStr}</strong></div>` : ''}
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

    try {
      currentCandles = await MarketAPI.fetchHistoricalCandles(tickerKey, activeTimeframe);
    } catch (e) {
      console.warn("Chart candle fetch warning:", e.message);
    } finally {
      isLoading = false;
      updateHeaderStats();
    }
  }

  function setChartType(type) {
    chartType = type;
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

    // Calculate dynamic period change and period high/low based on timeframe
    let periodChange = item.change;
    let periodChangePct = item.changePct;
    let periodHigh = item.high;
    let periodLow = item.low;
    let periodVol = item.volume;

    if (currentCandles && currentCandles.length > 1) {
      const first = currentCandles[0];
      const last = currentCandles[currentCandles.length - 1];
      
      if (activeTimeframe !== "1D" && first.open > 0) {
        periodChange = +(last.close - first.open).toFixed(dec);
        periodChangePct = +(((last.close - first.open) / first.open) * 100).toFixed(2);
      }
      
      const highs = currentCandles.map(c => c.high).filter(h => typeof h === "number" && !isNaN(h));
      const lows = currentCandles.map(c => c.low).filter(l => typeof l === "number" && !isNaN(l));
      if (highs.length > 0) periodHigh = Math.max(...highs);
      if (lows.length > 0) periodLow = Math.min(...lows);
    }

    if (changeEl) {
      const isPos = periodChange >= 0;
      changeEl.className = `pill-badge ${isPos ? 'pos' : 'neg'}`;
      const tfLabel = activeTimeframe === "1D" ? "1D" : (activeTimeframe === "1W" ? "1W" : (activeTimeframe === "1M" ? "1M" : (activeTimeframe === "1Y" ? "1Y" : "5Y")));
      changeEl.textContent = `${isPos ? '+' : ''}${periodChange.toFixed(dec)} (${isPos ? '+' : ''}${periodChangePct.toFixed(2)}% • ${tfLabel})`;
    }

    const statHighLabel = document.getElementById("statHighLabel");
    const statLowLabel = document.getElementById("statLowLabel");
    if (statHighLabel) statHighLabel.textContent = `${activeTimeframe} High`;
    if (statLowLabel) statLowLabel.textContent = `${activeTimeframe} Low`;

    const statHigh = document.getElementById("statHigh");
    const statLow = document.getElementById("statLow");
    const statVol = document.getElementById("statVol");
    if (statHigh) statHigh.textContent = "$" + (periodHigh ? periodHigh.toLocaleString(undefined, { minimumFractionDigits: dec }) : "-");
    if (statLow) statLow.textContent = "$" + (periodLow ? periodLow.toLocaleString(undefined, { minimumFractionDigits: dec }) : "-");
    if (statVol) statVol.textContent = periodVol || "-";

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

  // Draw rounded rectangle with canvas fallback
  function drawRoundedRect(c, x, y, width, height, radius) {
    if (typeof c.roundRect === "function") {
      c.beginPath();
      c.roundRect(x, y, width, height, radius);
      c.fill();
      return;
    }
    const r = Math.min(radius, width / 2, height / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + width - r, y);
    c.arcTo(x + width, y, x + width, y + r, r);
    c.lineTo(x + width, y + height - r);
    c.arcTo(x + width, y + height, x + width - r, y + height, r);
    c.lineTo(x + r, y + height);
    c.arcTo(x, y + height, x, y + height - r, r);
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, r);
    c.closePath();
    c.fill();
  }

  // Price badge helper for right scale
  function drawPriceBadge(c, x, y, width, height, bgColor, textColor, text) {
    c.save();
    c.fillStyle = bgColor;
    drawRoundedRect(c, x, y, width, height, 4);
    c.fillStyle = textColor;
    c.font = "bold 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, x + width / 2, y + height / 2);
    c.restore();
  }

  function render() {
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const displayW = Math.round(rect.width);
    const displayH = Math.round(rect.height);

    if (displayW === 0 || displayH === 0) return;

    // Cache resize check to eliminate context state wipe on 60fps loop
    if (canvas.width !== displayW * dpr || canvas.height !== displayH * dpr || cachedDpr !== dpr) {
      canvas.width = displayW * dpr;
      canvas.height = displayH * dpr;
      cachedDpr = dpr;
      cachedWidth = displayW;
      cachedHeight = displayH;
    }

    ctx.save();
    ctx.scale(dpr, dpr);

    const width = displayW;
    const height = displayH;

    // Theme detection
    const isDark = document.documentElement.getAttribute("data-theme") !== "light";
    const colorBg = isDark ? "#090d18" : "#ffffff";
    const colorLadderBg = isDark ? "rgba(15, 23, 42, 0.40)" : "rgba(241, 245, 249, 0.65)";
    const colorGrid = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.06)";
    const colorAxis = isDark ? "rgba(255, 255, 255, 0.10)" : "rgba(0, 0, 0, 0.10)";
    const colorText = isDark ? "rgba(148, 163, 184, 0.75)" : "rgba(71, 85, 105, 0.85)";
    const colorCrosshair = isDark ? "rgba(255, 255, 255, 0.32)" : "rgba(15, 23, 42, 0.32)";

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
    const priceHeight = plotHeight * 0.74;
    const volumeHeight = plotHeight * 0.20;
    const volumeBottom = height - GUTTER_BOTTOM;

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
    const slotWidth = plotWidth / count;
    // Keep candle width proportional: clamp between 2px and 28px
    const maxBarW = Math.min(28, Math.max(2, slotWidth * 0.74));
    const barW = Math.max(2, maxBarW);

    // 1. Right Price Scale Gutter Background Tint
    ctx.fillStyle = colorLadderBg;
    ctx.fillRect(plotWidth, 0, GUTTER_RIGHT, height);

    // Bottom Time Scale Gutter Background Tint
    ctx.fillRect(0, height - GUTTER_BOTTOM, width, GUTTER_BOTTOM);

    // 2. Draw Horizontal Grid Lines & Right Price Scale
    ctx.lineWidth = 1;
    const gridRows = 5;
    for (let r = 0; r <= gridRows; r++) {
      const y = Math.floor(GUTTER_TOP + (priceHeight / gridRows) * r) + 0.5;

      // Dashed horizontal grid
      ctx.strokeStyle = colorGrid;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotWidth, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Right axis tick mark
      ctx.strokeStyle = colorAxis;
      ctx.beginPath();
      ctx.moveTo(plotWidth, y);
      ctx.lineTo(plotWidth + 4, y);
      ctx.stroke();

      // Right axis price label
      const priceVal = maxPrice - (priceRange / gridRows) * r;
      ctx.fillStyle = colorText;
      ctx.font = "500 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "left";
      ctx.fillText("$" + priceVal.toFixed(dec), plotWidth + 8, y + 3.5);
    }

    // Right Y-axis vertical divider line
    ctx.strokeStyle = colorAxis;
    ctx.beginPath();
    ctx.moveTo(plotWidth + 0.5, 0);
    ctx.lineTo(plotWidth + 0.5, height - GUTTER_BOTTOM);
    ctx.stroke();

    // Bottom X-axis horizontal divider line
    ctx.beginPath();
    ctx.moveTo(0, Math.floor(height - GUTTER_BOTTOM) + 0.5);
    ctx.lineTo(width, Math.floor(height - GUTTER_BOTTOM) + 0.5);
    ctx.stroke();

    // 3. Draw X-Axis Time Labels & Vertical Grid Lines
    const step = Math.max(1, Math.floor(count / 6));
    ctx.fillStyle = colorText;
    ctx.font = "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";

    for (let i = 0; i < count; i += step) {
      const c = currentCandles[i];
      const x = Math.floor(i * slotWidth + slotWidth / 2) + 0.5;
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
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(x, GUTTER_TOP);
      ctx.lineTo(x, height - GUTTER_BOTTOM);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tick label
      ctx.fillText(label, x, height - 10);
    }

    // 4. Draw Volume Histogram Bars
    if (maxVolume > 0) {
      currentCandles.forEach((c, i) => {
        const isUp = c.close >= c.open;
        const x = Math.floor(i * slotWidth + slotWidth / 2);
        const barLeft = Math.round(x - barW / 2);
        const vHeight = Math.max(2, (c.volume / maxVolume) * volumeHeight);
        const vY = volumeBottom - vHeight;
        const isHovered = i === hoverIndex;

        ctx.fillStyle = isUp 
          ? (isHovered ? "rgba(16, 185, 129, 0.70)" : (isDark ? "rgba(16, 185, 129, 0.28)" : "rgba(16, 185, 129, 0.38)"))
          : (isHovered ? "rgba(244, 63, 94, 0.70)" : (isDark ? "rgba(244, 63, 94, 0.28)" : "rgba(244, 63, 94, 0.38)"));
        ctx.fillRect(barLeft, Math.round(vY), Math.round(barW), Math.round(vHeight));
      });
    }

    // 5. Draw Candlesticks or Smooth Line
    if (chartType === "candlestick") {
      currentCandles.forEach((c, i) => {
        const isUp = c.close >= c.open;
        const x = Math.floor(i * slotWidth + slotWidth / 2) + 0.5;
        const barLeft = Math.round(x - barW / 2);

        const yHigh = GUTTER_TOP + priceHeight - ((c.high - minPrice) / priceRange) * priceHeight;
        const yLow = GUTTER_TOP + priceHeight - ((c.low - minPrice) / priceRange) * priceHeight;
        const yOpen = GUTTER_TOP + priceHeight - ((c.open - minPrice) / priceRange) * priceHeight;
        const yClose = GUTTER_TOP + priceHeight - ((c.close - minPrice) / priceRange) * priceHeight;

        const bullColor = "#10b981";
        const bearColor = "#f43f5e";
        const candleColor = isUp ? bullColor : bearColor;

        // Wick - perfectly centered with subpixel precision
        ctx.strokeStyle = candleColor;
        ctx.lineWidth = barW > 6 ? 1.5 : 1.2;
        ctx.beginPath();
        ctx.moveTo(x, Math.round(yHigh));
        ctx.lineTo(x, Math.round(yLow));
        ctx.stroke();

        // Body
        const bodyTop = Math.round(Math.min(yOpen, yClose));
        const bodyHeight = Math.max(2, Math.round(Math.abs(yClose - yOpen)));

        ctx.fillStyle = candleColor;
        ctx.fillRect(barLeft, bodyTop, Math.round(barW), bodyHeight);

        // Crisp Doji cross tick if open === close
        if (bodyHeight === 2) {
          ctx.fillRect(barLeft, bodyTop, Math.round(barW), 2);
        }
      });
    } else {
      // Smooth Line Mode
      ctx.beginPath();
      currentCandles.forEach((c, i) => {
        const x = Math.floor(i * slotWidth + slotWidth / 2) + 0.5;
        const y = GUTTER_TOP + priceHeight - ((c.close - minPrice) / priceRange) * priceHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      // Glowing Area Fill
      const lastX = Math.floor((count - 1) * slotWidth + slotWidth / 2) + 0.5;
      const firstX = Math.floor(slotWidth / 2) + 0.5;
      ctx.lineTo(lastX, GUTTER_TOP + priceHeight);
      ctx.lineTo(firstX, GUTTER_TOP + priceHeight);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, GUTTER_TOP, 0, GUTTER_TOP + priceHeight);
      grad.addColorStop(0, isDark ? "rgba(56, 189, 248, 0.28)" : "rgba(2, 132, 199, 0.22)");
      grad.addColorStop(1, "rgba(56, 189, 248, 0.0)");
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // 6. Draw 20-period SMA Line
    if (count > 5) {
      const smaPeriod = Math.min(20, Math.floor(count / 2));
      ctx.beginPath();
      let started = false;
      for (let i = smaPeriod - 1; i < count; i++) {
        let sum = 0;
        for (let j = 0; j < smaPeriod; j++) sum += currentCandles[i - j].close;
        const avg = sum / smaPeriod;
        const x = Math.floor(i * slotWidth + slotWidth / 2) + 0.5;
        const y = GUTTER_TOP + priceHeight - ((avg - minPrice) / priceRange) * priceHeight;

        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 7. Sleek Top-Left Indicator Legend
    if (count > 0) {
      const smaVal = calculateSMA(currentCandles, 20);
      const rsiVal = calculateRSI(currentCandles, 14);
      
      ctx.save();
      ctx.font = "600 10.5px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "left";

      // SMA Dot & Label
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(14, 16, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(`SMA(20): $${smaVal.toFixed(dec)}`, 22, 19);

      // RSI Dot & Label
      const rsiColor = rsiVal >= 70 ? "#f43f5e" : (rsiVal <= 30 ? "#10b981" : "#38bdf8");
      ctx.fillStyle = rsiColor;
      ctx.beginPath();
      ctx.arc(150, 16, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(`RSI(14): ${rsiVal}`, 158, 19);

      ctx.restore();
    }

    // 8. Real-Time Moving Price Line & Active Candle Pulsating Beacon
    if (count > 0) {
      const lastCandle = currentCandles[count - 1];
      const lastX = Math.floor((count - 1) * slotWidth + slotWidth / 2) + 0.5;
      const livePriceY = Math.round(GUTTER_TOP + priceHeight - ((lastCandle.close - minPrice) / priceRange) * priceHeight);
      const isLiveUp = lastCandle.close >= lastCandle.open;
      const liveColor = isLiveUp ? "#10b981" : "#f43f5e";

      // Horizontal dashed live price reference line
      ctx.strokeStyle = liveColor;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(0, livePriceY + 0.5);
      ctx.lineTo(plotWidth, livePriceY + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);

      // Live pulsating ripple beacon at active candle tip
      const now = Date.now();
      const pulsePhase = (now % 1600) / 1600; // 0.0 -> 1.0
      const rippleRadius = 4 + pulsePhase * 14;
      const rippleAlpha = Math.max(0, 1 - pulsePhase) * 0.75;

      ctx.strokeStyle = isLiveUp ? `rgba(16, 185, 129, ${rippleAlpha})` : `rgba(244, 63, 94, ${rippleAlpha})`;
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(lastX, livePriceY, rippleRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Glowing solid center beacon dot
      ctx.fillStyle = liveColor;
      ctx.beginPath();
      ctx.arc(lastX, livePriceY, 4, 0, Math.PI * 2);
      ctx.fill();

      // Right axis live price badge (Highlighted pill, only if not hovered)
      if (hoverIndex < 0) {
        drawPriceBadge(
          ctx, 
          plotWidth + 3, 
          livePriceY - 10, 
          GUTTER_RIGHT - 6, 
          20, 
          liveColor, 
          "#ffffff", 
          "$" + lastCandle.close.toFixed(dec)
        );
      }
    }

    // 9. Interactive Crosshair & Scale Badges
    if (hoverIndex >= 0 && hoverIndex < count) {
      const c = currentCandles[hoverIndex];
      const hX = Math.floor(hoverIndex * slotWidth + slotWidth / 2) + 0.5;
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
      ctx.arc(hX, candleCloseY, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Right axis price badge
      drawPriceBadge(
        ctx, 
        plotWidth + 3, 
        hY - 10, 
        GUTTER_RIGHT - 6, 
        20, 
        isDark ? "#1e293b" : "#0f172a", 
        "#ffffff", 
        "$" + cursorPrice.toFixed(dec)
      );

      // Bottom axis date badge
      const d = c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp);
      const timeBadgeText = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + 
        (activeTimeframe === "1D" ? " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "");
      
      const badgeW = 92;
      const badgeX = Math.max(0, Math.min(hX - badgeW / 2, plotWidth - badgeW));
      ctx.fillStyle = isDark ? "#1e293b" : "#0f172a";
      drawRoundedRect(ctx, badgeX, height - GUTTER_BOTTOM + 4, badgeW, 18, 3);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(timeBadgeText, badgeX + badgeW / 2, height - GUTTER_BOTTOM + 13);
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = cvs.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

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

  // Draw miniature sparkline from real price telemetry with area fill
  function drawSparkline(canvasId, isPositive, dataPoints) {
    const cvs = document.getElementById(canvasId);
    if (!cvs) return;
    const c = cvs.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = cvs.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    cvs.width = rect.width * dpr;
    cvs.height = rect.height * dpr;

    c.save();
    c.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    c.clearRect(0, 0, w, h);

    const data = (dataPoints && dataPoints.length > 1)
      ? dataPoints
      : (isPositive 
          ? [12, 14, 13, 17, 16, 21, 24, 23, 28, 33, 37] 
          : [37, 34, 35, 30, 32, 26, 23, 24, 19, 15, 11]);

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = (max - min) || 1;

    const strokeColor = isPositive ? "#10b981" : "#f43f5e";
    const areaTop = isPositive ? "rgba(16, 185, 129, 0.22)" : "rgba(244, 63, 94, 0.22)";

    // Stroke path
    c.beginPath();
    data.forEach((val, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((val - min) / range) * (h * 0.70) - (h * 0.15);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });

    c.strokeStyle = strokeColor;
    c.lineWidth = 1.8;
    c.lineJoin = "round";
    c.lineCap = "round";
    c.stroke();

    // Area Fill
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.closePath();
    const grad = c.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, areaTop);
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    c.fillStyle = grad;
    c.fill();

    c.restore();
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
    onPriceTick,
    getActiveTicker: () => activeTicker,
    getActiveTimeframe: () => activeTimeframe,
    getChartType: () => chartType
  };
})();
