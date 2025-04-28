require('dotenv').config();
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv)).argv;
const fs = require('fs');
const path = require('path');

if (!argv.type) {
  throw new Error('"type" is missed');
}

if (!argv.url) {
  throw new Error('"url" is missed');
}

const scraperPath = path.resolve(__dirname, `./scrapers/${argv.type}.scraper.js`);

if (!fs.existsSync(scraperPath)) {
  throw new Error('Scraper does not exist');
}

const useProxy = !!argv.useProxy;

const scraper = require(scraperPath);
const BrowserService = require('./services/BrowserService');

(async () => {
  const browser = await BrowserService.getBrowser(useProxy);

  console.log(`Running ${argv.type} scrapper`);

  try {
    const result = await scraper.scrape(browser, argv.url, useProxy);

    console.log(JSON.stringify(result));
  } finally {
    await BrowserService.close();
  }
})();

