/**
 * Vercel Serverless Function Entry Point for World Stock News
 * Mounts the Express Application with SSR & REST API routes
 */

const { app } = require('../serve.js');

module.exports = app;
