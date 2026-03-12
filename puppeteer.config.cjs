const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
    // Standardize cache location for Render and Local
    cacheDirectory: join(__dirname, 'puppeteer_cache'),
};
