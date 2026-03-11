const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
    // Changes the cache location for Puppeteer.
    // At runtime, this file is in the root, and we want to look in dist/browser_bin
    cacheDirectory: join(__dirname, 'dist', 'browser_bin'),
};
