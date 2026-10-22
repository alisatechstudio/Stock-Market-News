/**
 * World Stock News - Standalone MongoDB Seeding & Verification Script
 * Usage:
 *   node scripts/seed-mongodb.js
 *   node scripts/seed-mongodb.js --uri "mongodb+srv://user:pass@cluster.mongodb.net/..."
 */

const fs = require('fs');
const path = require('path');

// Parse --uri argument if passed
const args = process.argv.slice(2);
const uriIdx = args.indexOf('--uri');
if (uriIdx !== -1 && args[uriIdx + 1]) {
  process.env.MONGODB_URI = args[uriIdx + 1];
}

// Check for local .env file
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath) && !process.env.MONGODB_URI) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    }
  });
}

const mongodb = require('../lib/mongodb.js');
const { ArticlesData } = require('../js/articles-data.js');

async function main() {
  console.log("=================================================");
  console.log(" World Stock News - MongoDB Atlas Seeder & Diagnostics");
  console.log("=================================================");

  if (!mongodb.isMongoConfigured()) {
    console.error("\n❌ MONGODB_URI is not set!");
    console.log("To seed MongoDB Atlas, provide your connection string via:");
    console.log("  1. Environment variable: set MONGODB_URI=\"mongodb+srv://...\"");
    console.log("  2. Command line flag:    node scripts/seed-mongodb.js --uri \"mongodb+srv://...\"");
    console.log("  3. Or create a .env file with MONGODB_URI=mongodb+srv://...");
    process.exit(1);
  }

  console.log(`Connecting to MongoDB... (Target Database: ${mongodb.getDbName()})`);
  const status = await mongodb.getDbStatus();
  console.log("Current Status Before Seeding:", status);

  if (!status.connected) {
    console.error("\n❌ Failed to connect to MongoDB cluster:", status.error);
    process.exit(1);
  }

  console.log(`\nStarting seed of ${ArticlesData.length} articles...`);
  const result = await mongodb.seedInitialArticles(ArticlesData);
  console.log("Seed Result:", result);

  const finalStatus = await mongodb.getDbStatus();
  console.log("\n=================================================");
  console.log("✅ Final Database Verification:");
  console.log(`   Database Name:     ${finalStatus.database}`);
  console.log(`   Collections:       ${finalStatus.collections.join(', ')}`);
  console.log(`   Articles in DB:    ${finalStatus.articleCount}`);
  console.log("=================================================");

  process.exit(0);
}

main().catch(err => {
  console.error("Fatal error during seeding:", err);
  process.exit(1);
});
