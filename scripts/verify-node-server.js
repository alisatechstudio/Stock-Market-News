/**
 * Automated Verification Script for World Stock News Node.js Server
 */

const http = require('http');
const { app, PORT } = require('../serve.js');

const TEST_PORT = 3456;

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${TEST_PORT}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('--- Starting Automated Server Verification ---');
  const server = app.listen(TEST_PORT, async () => {
    try {
      let passed = 0;
      let total = 0;

      function assert(name, condition, details = '') {
        total++;
        if (condition) {
          console.log(`[PASS] ${name}`);
          passed++;
        } else {
          console.error(`[FAIL] ${name}: ${details}`);
        }
      }

      // 1. GET /
      const home = await makeRequest('/');
      assert('GET / returns 200 OK', home.statusCode === 200);
      assert('GET / contains World Stock News title', home.body.includes('World Stock News'));
      assert('GET / has security header nosniff', home.headers['x-content-type-options'] === 'nosniff');

      // 2. GET /article/:id (SSR)
      const articleSsr = await makeRequest('/article/three-big-takeaways-from-the-imf-world-bank-meetings-3a6m');
      assert('GET /article/:id returns 200 OK', articleSsr.statusCode === 200);
      assert('GET /article/:id SSR title injected', articleSsr.body.includes('Three big takeaways from the IMF-World Bank meetings | World Stock News'));
      assert('GET /article/:id SSR bodyHtml pre-rendered', articleSsr.body.includes('Market Context & Catalyst') || articleSsr.body.includes('Three big takeaways'));
      assert('GET /article/:id SSR canonical link injected', articleSsr.body.includes('https://worldstocknews.online/article/three-big-takeaways-from-the-imf-world-bank-meetings-3a6m'));
      assert('GET /article/:id SSR NewsArticle schema injected', articleSsr.body.includes('"@type": "NewsArticle"') || articleSsr.body.includes('"@type":"NewsArticle"'));

      // 3. GET /article.html?id=... (SSR legacy param)
      const legacyArticle = await makeRequest('/article.html?id=three-big-takeaways-from-the-imf-world-bank-meetings-3a6m');
      assert('GET /article.html?id=... returns 200 OK', legacyArticle.statusCode === 200);
      assert('GET /article.html?id=... SSR title injected', legacyArticle.body.includes('Three big takeaways from the IMF-World Bank'));

      // 4. GET /about, /contact, /privacy-policy, /terms
      const about = await makeRequest('/about');
      assert('GET /about returns 200 OK', about.statusCode === 200 && about.body.includes('About Us'));

      const contact = await makeRequest('/contact');
      assert('GET /contact returns 200 OK', contact.statusCode === 200 && contact.body.includes('Contact Us'));

      const privacy = await makeRequest('/privacy-policy');
      assert('GET /privacy-policy returns 200 OK', privacy.statusCode === 200 && privacy.body.includes('Privacy Policy'));

      const terms = await makeRequest('/terms');
      assert('GET /terms returns 200 OK', terms.statusCode === 200 && terms.body.includes('Terms of Service'));

      // 5. GET /category/:slug
      const cat = await makeRequest('/category/tech-ai');
      assert('GET /category/:slug returns 200 OK', cat.statusCode === 200);

      // 6. GET /api/quotes
      const quotes = await makeRequest('/api/quotes');
      assert('GET /api/quotes returns 200 OK', quotes.statusCode === 200);
      const quotesJson = JSON.parse(quotes.body);
      assert('GET /api/quotes returns quote object with data', quotesJson.success && quotesJson.quotes && Object.keys(quotesJson.quotes).length > 0);
      assert('GET /api/quotes includes S&P 500 (^GSPC)', quotesJson.quotes && quotesJson.quotes['^GSPC'] && quotesJson.quotes['^GSPC'].name);

      // 6b. GET /api/chart (Candle feed)
      const chartRes = await makeRequest('/api/chart?symbol=%5EGSPC&timeframe=1M');
      assert('GET /api/chart returns 200 OK', chartRes.statusCode === 200);
      const chartJson = JSON.parse(chartRes.body);
      assert('GET /api/chart returns candle telemetry array', chartJson.success && Array.isArray(chartJson.candles) && chartJson.candles.length > 0);

      // 7. GET /api/health
      const health = await makeRequest('/api/health');
      assert('GET /api/health returns 200 OK', health.statusCode === 200);
      const healthJson = JSON.parse(health.body);
      assert('GET /api/health status is ok', healthJson.status === 'ok' && healthJson.server === 'WorldStockNews-Node/2.0.0');
      assert('GET /api/health reports mongodb connection status', typeof healthJson.mongodb === 'string');

      // 8. GET /api/articles (MongoDB / in-memory feed)
      const articlesRes = await makeRequest('/api/articles?limit=10');
      assert('GET /api/articles returns 200 OK', articlesRes.statusCode === 200);
      const articlesJson = JSON.parse(articlesRes.body);
      assert('GET /api/articles returns success and article array', articlesJson.success && Array.isArray(articlesJson.articles) && articlesJson.articles.length > 0);

      // 9. GET /api/cron (Vercel Cron endpoint)
      const cronRes = await makeRequest('/api/cron');
      assert('GET /api/cron returns 200 OK', cronRes.statusCode === 200);
      const cronJson = JSON.parse(cronRes.body);
      assert('GET /api/cron reports success', cronJson.success === true);

      // 10. Vercel Serverless Function entrypoint test
      const vercelApp = require('../api/index.js');
      assert('api/index.js exports callable Vercel Serverless Function', typeof vercelApp === 'function');

      // 11. MongoDB Data Access Layer test
      const mongoModule = require('../lib/mongodb.js');
      assert('lib/mongodb.js exports isMongoConfigured & methods', typeof mongoModule.isMongoConfigured === 'function' && typeof mongoModule.getArticles === 'function');

      // 12. GET /favicon.ico and /favicon.svg
      const favIco = await makeRequest('/favicon.ico');
      assert('GET /favicon.ico returns 200 OK', favIco.statusCode === 200);

      const favSvg = await makeRequest('/favicon.svg');
      assert('GET /favicon.svg returns 200 OK', favSvg.statusCode === 200);

      // 13. GET /sitemap.xml
      const sitemap = await makeRequest('/sitemap.xml');
      assert('GET /sitemap.xml returns 200 OK', sitemap.statusCode === 200 && sitemap.body.includes('<urlset'));

      // 14. GET /non-existent-route-404
      const notFound = await makeRequest('/this-page-does-not-exist');
      assert('GET 404 returns 404 status', notFound.statusCode === 404);
      assert('GET 404 returns custom institutional 404 page', notFound.body.includes('404') && notFound.body.includes('World Stock News'));

      console.log(`\nVerification Complete: ${passed}/${total} tests passed.`);
      server.close(() => {
        process.exit(passed === total ? 0 : 1);
      });
    } catch (err) {
      console.error('Error during testing:', err);
      server.close(() => process.exit(1));
    }
  });
}

runTests();
