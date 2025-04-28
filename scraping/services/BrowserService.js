const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const BlockResourcesPlugin = require('puppeteer-extra-plugin-block-resources');

puppeteer.use(StealthPlugin());
puppeteer.use(BlockResourcesPlugin({
  blockedTypes: new Set([
    'stylesheet',
    'media',
    'font',
    'texttrack',
    'eventsource',
    'websocket',
    'manifest',
  ]),
}));

module.exports = {
  browser: null,

  async getBrowser(useProxy = false) {
    if (null === this.browser) {
      const puppeteerArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--window-position=0,0',
        '--ignore-certifcate-errors',
        '--ignore-certifcate-errors-spki-list',
        `--lang=${process.env.BROWSER_LANG}`,
      ];

      if (useProxy) {
        puppeteerArgs.push(`--proxy-server=${process.env.PROXY_SERVER}`);
      }

      this.browser = await puppeteer.launch({
        executablePath: process.env.CHROME_BIN || null,
        headless: true,
        defaultViewport: { width: 1920, height: 1080 },
        args: puppeteerArgs,
      });
    }

    return this.browser;
  },

  async getPage(browser, useProxy = false) {
    const page = await browser.newPage();

    await page.setUserAgent(process.env.BROWSER_PAGE_USER_AGENT);

    console.log('Should use proxy:', useProxy);

    if (useProxy) {
      await page.authenticate({
        username: process.env.PROXY_USERNAME,
        password: process.env.PROXY_PASSWORD,
      });
    }

    return page;
  },

  async close() {
    if (null === this.browser) {
      return;
    }

    await this.browser.close();

    this.browser = null;
  },
};
