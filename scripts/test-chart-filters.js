const fs = require('fs');
const path = require('path');

// Simulate browser environment with full DOM mock
class MockClassList {
  constructor() {
    this._set = new Set();
  }
  add(...classes) {
    classes.forEach(c => this._set.add(c));
  }
  remove(...classes) {
    classes.forEach(c => this._set.delete(c));
  }
  toggle(c) {
    if (this._set.has(c)) this._set.delete(c);
    else this._set.add(c);
  }
  contains(c) {
    return this._set.has(c);
  }
  toString() {
    return Array.from(this._set).join(' ');
  }
}

class MockElement {
  constructor(tagName = 'div', id = '', className = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new MockClassList();
    if (className) {
      className.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
    }
    this.attributes = {};
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.listeners = {};
    this.value = '';
    this.textContent = '';
    this._innerHTML = '';
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
    if (name === 'class') {
      this.classList = new MockClassList();
      String(val).split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
    }
    if (name === 'id') this.id = String(val);
  }

  getAttribute(name) {
    if (name === 'class') return this.classList.toString();
    if (name === 'id') return this.id;
    return this.attributes[name] !== undefined ? this.attributes[name] : null;
  }

  addEventListener(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  dispatchEvent(event) {
    const list = this.listeners[event.type] || [];
    list.forEach(fn => fn.call(this, event));
  }

  click() {
    const event = { type: 'click', preventDefault: () => {}, target: this };
    this.dispatchEvent(event);
  }

  change(val) {
    if (val !== undefined) this.value = val;
    const event = { type: 'change', target: this };
    this.dispatchEvent(event);
  }

  scrollIntoView() {}

  getBoundingClientRect() {
    return { top: 0, left: 0, width: 800, height: 400, right: 800, bottom: 400 };
  }

  getContext(type) {
    return {
      save: () => {},
      restore: () => {},
      scale: () => {},
      clearRect: () => {},
      fillRect: () => {},
      fillText: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      arcTo: () => {},
      closePath: () => {},
      setLineDash: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      measureText: () => ({ width: 40 }),
      roundRect: () => {}
    };
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    // Basic parser for child buttons / tags with data-* and attributes
    const tagRegex = /<([a-z0-9]+)([^>]*)>(.*?)<\/\1>/gis;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      const tag = match[1];
      const attrStr = match[2];
      const inner = match[3];
      const child = new MockElement(tag);

      // parse attrs
      const attrRegex = /([a-z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gi;
      let aMatch;
      while ((aMatch = attrRegex.exec(attrStr)) !== null) {
        const aName = aMatch[1];
        const aVal = aMatch[2] || aMatch[3] || aMatch[4] || '';
        child.setAttribute(aName, aVal);
      }
      child.textContent = inner.replace(/<[^>]+>/g, '').trim();
      child._innerHTML = inner;
      child.parentElement = this;
      this.children.push(child);
    }
  }

  querySelectorAll(sel) {
    const results = [];
    function walk(node) {
      node.children.forEach(c => {
        if (matches(c, sel)) results.push(c);
        walk(c);
      });
    }
    walk(this);
    return results;
  }

  querySelector(sel) {
    const res = this.querySelectorAll(sel);
    return res[0] || null;
  }
}

function matches(el, sel) {
  if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  if (sel.startsWith('[') && sel.endsWith(']')) {
    const inner = sel.slice(1, -1);
    if (inner.includes('=')) {
      const [attr, val] = inner.split('=');
      const cleanVal = val.replace(/["']/g, '');
      return el.getAttribute(attr) === cleanVal;
    }
    return el.getAttribute(inner) !== null;
  }
  return el.tagName.toLowerCase() === sel.toLowerCase();
}

// Build Global DOM Mock
const elementsById = new Map();
const allElements = [];

function registerEl(el) {
  if (el.id) elementsById.set(el.id, el);
  allElements.push(el);
}

const mockDoc = {
  documentElement: new MockElement('html'),
  body: new MockElement('body'),
  getElementById: (id) => elementsById.get(id) || null,
  querySelector: (sel) => {
    for (const el of allElements) {
      if (matches(el, sel)) return el;
      const found = el.querySelector(sel);
      if (found) return found;
    }
    return null;
  },
  querySelectorAll: (sel) => {
    const set = new Set();
    for (const el of allElements) {
      if (matches(el, sel)) set.add(el);
      el.querySelectorAll(sel).forEach(c => set.add(c));
    }
    return Array.from(set);
  },
  createElement: (tag) => new MockElement(tag),
  addEventListener: (event, fn) => {
    if (event === 'DOMContentLoaded') {
      setTimeout(fn, 10);
    }
  }
};

// Setup chart elements according to index.html
const mainCanvas = new MockElement('canvas', 'mainStockCanvas');
const chartSection = new MockElement('section', 'stockChartSection');
const chartTickerChips = new MockElement('div', 'chartTickerChips');
const chartInstrumentSelect = new MockElement('select', 'chartInstrumentSelect');
const chartTickerName = new MockElement('span', 'chartTickerName');
const chartTickerFull = new MockElement('span', 'chartTickerFull');
const chartPriceDisplay = new MockElement('div', 'chartPriceDisplay');
const chartChangeDisplay = new MockElement('span', 'chartChangeDisplay');
const chartBtnCandle = new MockElement('button', 'chartBtnCandle', 'pill-btn active');
const chartBtnLine = new MockElement('button', 'chartBtnLine', 'pill-btn');
const statHighLabel = new MockElement('span', 'statHighLabel');
const statLowLabel = new MockElement('span', 'statLowLabel');
const statHigh = new MockElement('span', 'statHigh');
const statLow = new MockElement('span', 'statLow');
const statVol = new MockElement('span', 'statVol');
const statSMA = new MockElement('span', 'statSMA');
const statRSI = new MockElement('span', 'statRSI');

const catAll = new MockElement('button', '', 'filter-chip active'); catAll.setAttribute('data-chart-category', 'all');
const catIndex = new MockElement('button', '', 'filter-chip'); catIndex.setAttribute('data-chart-category', 'index');
const catStock = new MockElement('button', '', 'filter-chip'); catStock.setAttribute('data-chart-category', 'stock');
const catCrypto = new MockElement('button', '', 'filter-chip'); catCrypto.setAttribute('data-chart-category', 'crypto');
const catCommodity = new MockElement('button', '', 'filter-chip'); catCommodity.setAttribute('data-chart-category', 'commodity');
const catForex = new MockElement('button', '', 'filter-chip'); catForex.setAttribute('data-chart-category', 'forex');

const tf1D = new MockElement('button', '', 'pill-btn'); tf1D.setAttribute('data-timeframe', '1D');
const tf1W = new MockElement('button', '', 'pill-btn'); tf1W.setAttribute('data-timeframe', '1W');
const tf1M = new MockElement('button', '', 'pill-btn active'); tf1M.setAttribute('data-timeframe', '1M');
const tf1Y = new MockElement('button', '', 'pill-btn'); tf1Y.setAttribute('data-timeframe', '1Y');
const tf5Y = new MockElement('button', '', 'pill-btn'); tf5Y.setAttribute('data-timeframe', '5Y');

[
  mainCanvas, chartSection, chartTickerChips, chartInstrumentSelect,
  chartTickerName, chartTickerFull, chartPriceDisplay, chartChangeDisplay,
  chartBtnCandle, chartBtnLine, statHighLabel, statLowLabel, statHigh, statLow,
  statVol, statSMA, statRSI, catAll, catIndex, catStock, catCrypto, catCommodity, catForex,
  tf1D, tf1W, tf1M, tf1Y, tf5Y
].forEach(registerEl);

// Global browser sandbox
global.window = global;
global.window.addEventListener = (event, fn) => {
  if (event === 'DOMContentLoaded') setTimeout(fn, 10);
};
global.window.removeEventListener = () => {};
global.document = mockDoc;
global.navigator = { clipboard: { writeText: () => {} } };
global.requestAnimationFrame = (fn) => setTimeout(fn, 16);
global.localStorage = {
  getItem: () => null,
  setItem: () => {}
};

// Global fetch mock to localhost server
global.fetch = async (url, opts) => {
  const fullUrl = url.startsWith('http') ? url : `http://localhost:3000${url}`;
  const res = await (await import('node:http')).get ? require('node-fetch-native') : null;
  // Node 18+ has built-in fetch
  return globalThis.fetch(fullUrl, opts);
};

// Load code files in sandbox
const apiCode = fs.readFileSync(path.join(__dirname, '../js/api.js'), 'utf-8');
const chartsCode = fs.readFileSync(path.join(__dirname, '../js/charts.js'), 'utf-8');
const mainCode = fs.readFileSync(path.join(__dirname, '../js/main.js'), 'utf-8');

eval(apiCode.replace('const MarketAPI =', 'global.MarketAPI ='));
eval(chartsCode.replace('const StockChart =', 'global.StockChart ='));
eval(mainCode);

async function runTests() {
  console.log("Waiting for DOMContentLoaded and initialization...");
  await new Promise(r => setTimeout(r, 100));

  console.log("\n=== TEST 1: Initial Chart State ===");
  console.log("StockChart active ticker:", StockChart.getActiveTicker());
  console.log("StockChart active timeframe:", StockChart.getActiveTimeframe());
  console.log("StockChart chart type:", StockChart.getChartType());
  console.log("Chips in container:", chartTickerChips.children.length);

  console.log("\n=== TEST 2: Click Category 'crypto' ===");
  catCrypto.click();
  console.log("Category 'crypto' active?", catCrypto.classList.contains('active'));
  console.log("Category 'all' active?", catAll.classList.contains('active'));
  console.log("Chips rendered for crypto:", chartTickerChips.children.length);
  chartTickerChips.children.forEach(c => {
    console.log("  - Chip:", c.getAttribute('data-chart-ticker'), c.textContent);
  });

  console.log("\n=== TEST 3: Click 'BTC-USD' Ticker Chip ===");
  const btcChip = chartTickerChips.children.find(c => c.getAttribute('data-chart-ticker') === 'BTC-USD');
  if (btcChip) {
    btcChip.click();
    await new Promise(r => setTimeout(r, 150));
    console.log("Active ticker now:", StockChart.getActiveTicker());
    console.log("Header ticker text:", chartTickerName.textContent);
    console.log("Dropdown select value:", chartInstrumentSelect.value);
  } else {
    console.error("FAIL: BTC-USD chip not found!");
  }

  console.log("\n=== TEST 4: Click Timeframe '1D' ===");
  tf1D.click();
  await new Promise(r => setTimeout(r, 150));
  console.log("Timeframe active class on 1D?", tf1D.classList.contains('active'));
  console.log("Timeframe active class on 1M?", tf1M.classList.contains('active'));
  console.log("StockChart active timeframe:", StockChart.getActiveTimeframe());
  console.log("High label:", statHighLabel.textContent);

  console.log("\n=== TEST 5: Toggle Chart Type to 'Line' ===");
  chartBtnLine.click();
  console.log("Line button active?", chartBtnLine.classList.contains('active'));
  console.log("Candle button active?", chartBtnCandle.classList.contains('active'));
  console.log("StockChart chart type:", StockChart.getChartType());

  console.log("\n=== TEST 6: Change Dropdown Select to 'NVDA' ===");
  chartInstrumentSelect.change('NVDA');
  await new Promise(r => setTimeout(r, 150));
  console.log("Active ticker now:", StockChart.getActiveTicker());
  console.log("Header ticker text:", chartTickerName.textContent);

  console.log("\n=== TEST 7: Click Category 'stock' ===");
  catStock.click();
  console.log("Chips rendered for stock:", chartTickerChips.children.length);
  const nvdaChip = chartTickerChips.children.find(c => c.getAttribute('data-chart-ticker') === 'NVDA');
  console.log("NVDA chip active?", nvdaChip ? nvdaChip.classList.contains('active') : false);

  process.exit(0);
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

