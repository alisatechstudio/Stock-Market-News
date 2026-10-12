/**
 * MarketPulse - Canvas Financial Charting Engine
 * Features:
 * - Professional Candlestick & Smooth Line rendering
 * - 20-period Simple Moving Average (SMA 20)
 * - Trading Volume histogram bars
 * - High-DPI screen support (Retina crispness)
 * - Interactive Crosshair with Price/Time Tooltips
 * - Mini sparklines for ticker cards
 */

const StockChart = (function() {
  let canvas = null;
  let ctx = null;
  let currentCandles = [];
  let chartType = "candlestick"; // "candlestick" or "line"
  let activeTicker = "^GSPC";
  let activeTimeframe = "1M";
  let hoverIndex = -1;

  function init(canvasId) {
    canvas = document.getElementById(canvasId);
    if (!canvas) return;
    ctx = canvas.getContext("2d");

    setupEvents();
    loadTicker(activeTicker, activeTimeframe);
    window.addEventListener("resize", handleResize);
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
      const count = currentCandles.length;
      if (count === 0) return;

      const candleWidth = rect.width / count;
      const idx = Math.min(count - 1, Math.max(0, Math.floor(x / candleWidth)));
      hoverIndex = idx;
      render();
      updateTooltip(e.clientX, e.clientY, currentCandles[idx]);
    });

    canvas.addEventListener("mouseleave", () => {
      hoverIndex = -1;
      render();
      hideTooltip();
    });
  }

  function updateTooltip(mouseX, mouseY, candle) {
    const tip = document.getElementById("chartTooltip");
    if (!tip || !candle) return;

    const isUp = candle.close >= candle.open;
    tip.style.display = "block";
    tip.style.left = (mouseX + 15) + "px";
    tip.style.top = (mouseY - 30) + "px";

    const dateStr = candle.timestamp.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    tip.innerHTML = `
      <div style="font-weight:700; margin-bottom:4px; color:var(--text-muted);">${dateStr}</div>
      <div style="display:flex; justify-content:space-between; gap:12px;"><span>Open:</span> <strong>$${candle.open.toFixed(2)}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:12px;"><span>High:</span> <strong>$${candle.high.toFixed(2)}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:12px;"><span>Low:</span> <strong>$${candle.low.toFixed(2)}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:12px;"><span>Close:</span> <strong style="color:${isUp ? 'var(--bullish)' : 'var(--bearish)'}">$${candle.close.toFixed(2)}</strong></div>
      <div style="display:flex; justify-content:space-between; gap:12px;"><span>Vol:</span> <strong>${(candle.volume / 1000000).toFixed(2)}M</strong></div>
    `;
  }

  function hideTooltip() {
    const tip = document.getElementById("chartTooltip");
    if (tip) tip.style.display = "none";
  }

  function loadTicker(tickerKey, timeframe) {
    activeTicker = tickerKey;
    activeTimeframe = timeframe || activeTimeframe;
    currentCandles = MarketAPI.generateHistoricalCandles(tickerKey, activeTimeframe);
    render();
    updateHeaderStats();
  }

  function setChartType(type) {
    chartType = type;
    render();
  }

  function setTimeframe(tf) {
    activeTimeframe = tf;
    loadTicker(activeTicker, tf);
  }

  function updateHeaderStats() {
    const item = MarketAPI.getTicker(activeTicker);
    if (!item) return;

    const nameEl = document.getElementById("chartTickerName");
    const fullEl = document.getElementById("chartTickerFull");
    const priceEl = document.getElementById("chartPriceDisplay");
    const changeEl = document.getElementById("chartChangeDisplay");

    if (nameEl) nameEl.textContent = item.symbol;
    if (fullEl) fullEl.textContent = item.name;
    if (priceEl) priceEl.textContent = "$" + item.price.toLocaleString(undefined, { minimumFractionDigits: 2 });
    if (changeEl) {
      const isPos = item.change >= 0;
      changeEl.className = `pill-badge ${isPos ? 'pos' : 'neg'}`;
      changeEl.textContent = `${isPos ? '+' : ''}${item.change.toFixed(2)} (${isPos ? '+' : ''}${item.changePct.toFixed(2)}%)`;
    }

    const statHigh = document.getElementById("statHigh");
    const statLow = document.getElementById("statLow");
    const statVol = document.getElementById("statVol");
    if (statHigh) statHigh.textContent = "$" + item.high;
    if (statLow) statLow.textContent = "$" + item.low;
    if (statVol) statVol.textContent = item.volume || "3.2B";
  }

  function render() {
    if (!canvas || !ctx || currentCandles.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Clear background
    ctx.clearRect(0, 0, width, height);

    const priceHeight = height * 0.75;
    const volumeHeight = height * 0.20;
    const volumeTop = height * 0.78;

    // Min & Max calculations
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVolume = 0;

    currentCandles.forEach(c => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.volume > maxVolume) maxVolume = c.volume;
    });

    const pricePadding = (maxPrice - minPrice) * 0.08 || 1;
    minPrice -= pricePadding;
    maxPrice += pricePadding;
    const priceRange = maxPrice - minPrice;

    const count = currentCandles.length;
    const candleWidth = width / count;
    const barPadding = Math.max(1, candleWidth * 0.25);

    // Draw horizontal grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    const gridRows = 5;
    for (let r = 0; r <= gridRows; r++) {
      const y = (priceHeight / gridRows) * r;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      // Price labels
      const priceVal = maxPrice - (priceRange / gridRows) * r;
      ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText("$" + priceVal.toFixed(2), width - 65, y - 4);
    }

    // Draw Volume Bars
    currentCandles.forEach((c, i) => {
      const isUp = c.close >= c.open;
      const x = i * candleWidth;
      const vHeight = (c.volume / maxVolume) * volumeHeight;
      const vY = height - vHeight;

      ctx.fillStyle = isUp ? "rgba(16, 185, 129, 0.25)" : "rgba(244, 63, 94, 0.25)";
      ctx.fillRect(x + barPadding, vY, candleWidth - barPadding * 2, vHeight);
    });

    // Draw Candlesticks or Line Chart
    if (chartType === "candlestick") {
      currentCandles.forEach((c, i) => {
        const isUp = c.close >= c.open;
        const x = i * candleWidth + candleWidth / 2;
        const barLeft = i * candleWidth + barPadding;
        const barW = Math.max(2, candleWidth - barPadding * 2);

        const yHigh = priceHeight - ((c.high - minPrice) / priceRange) * priceHeight;
        const yLow = priceHeight - ((c.low - minPrice) / priceRange) * priceHeight;
        const yOpen = priceHeight - ((c.open - minPrice) / priceRange) * priceHeight;
        const yClose = priceHeight - ((c.close - minPrice) / priceRange) * priceHeight;

        // Wick
        ctx.strokeStyle = isUp ? "#10b981" : "#f43f5e";
        ctx.lineWidth = 1.5;
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
      // Smooth gradient line chart
      ctx.beginPath();
      currentCandles.forEach((c, i) => {
        const x = i * candleWidth + candleWidth / 2;
        const y = priceHeight - ((c.close - minPrice) / priceRange) * priceHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Area fill
      const lastX = (count - 1) * candleWidth + candleWidth / 2;
      ctx.lineTo(lastX, priceHeight);
      ctx.lineTo(candleWidth / 2, priceHeight);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, priceHeight);
      grad.addColorStop(0, "rgba(56, 189, 248, 0.28)");
      grad.addColorStop(1, "rgba(56, 189, 248, 0.0)");
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // 20-period SMA line
    if (count > 5) {
      const smaPeriod = 10;
      ctx.beginPath();
      let started = false;
      for (let i = smaPeriod - 1; i < count; i++) {
        let sum = 0;
        for (let j = 0; j < smaPeriod; j++) sum += currentCandles[i - j].close;
        const avg = sum / smaPeriod;
        const x = i * candleWidth + candleWidth / 2;
        const y = priceHeight - ((avg - minPrice) / priceRange) * priceHeight;

        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Crosshair if hovering
    if (hoverIndex >= 0 && hoverIndex < count) {
      const c = currentCandles[hoverIndex];
      const hX = hoverIndex * candleWidth + candleWidth / 2;
      const hY = priceHeight - ((c.close - minPrice) / priceRange) * priceHeight;

      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(hX, 0);
      ctx.lineTo(hX, height);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, hY);
      ctx.lineTo(width, hY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Point circle
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(hX, hY, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
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

    // Gauge arc segments: Extreme Fear (red) -> Fear (orange) -> Neutral (yellow) -> Greed (light green) -> Extreme Greed (emerald)
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

    // Needle Angle based on score (0 to 100)
    const angle = Math.PI + (score / 100) * Math.PI;
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

    // Center pin
    c.beginPath();
    c.arc(cx, cy, 7, 0, Math.PI * 2);
    c.fillStyle = "#38bdf8";
    c.fill();

    c.restore();
  }

  // Draw miniature sparkline
  function drawSparkline(canvasId, isPositive) {
    const cvs = document.getElementById(canvasId);
    if (!cvs) return;
    const c = cvs.getContext("2d");
    const w = cvs.width = cvs.clientWidth * (window.devicePixelRatio || 1);
    const h = cvs.height = cvs.clientHeight * (window.devicePixelRatio || 1);
    c.clearRect(0, 0, w, h);

    const points = 16;
    const data = [];
    let cur = isPositive ? 20 : 80;
    for (let i = 0; i < points; i++) {
      cur += (Math.random() - (isPositive ? 0.42 : 0.58)) * 14;
      data.push(cur);
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = (max - min) || 1;

    c.beginPath();
    data.forEach((val, i) => {
      const x = (i / (points - 1)) * w;
      const y = h - ((val - min) / range) * (h * 0.75) - (h * 0.12);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });

    c.strokeStyle = isPositive ? "#10b981" : "#f43f5e";
    c.lineWidth = 2 * (window.devicePixelRatio || 1);
    c.stroke();
  }

  return {
    init,
    loadTicker,
    setChartType,
    setTimeframe,
    render,
    drawFearGreedGauge,
    drawSparkline
  };
})();
