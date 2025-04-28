const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const PORT = 8080;
const HOST = '0.0.0.0';

const app = express();

app.get('/', async (request, response) => {
  if (!request.query.type) {
    return response.status(400).json({ message: '"type" is missed' });
  }

  if (!request.query.url) {
    return response.status(400).json({ message: '"url" is missed' });
  }

  const scraperPath = path.resolve(__dirname, `./scrapers/${request.query.type}.scraper.js`);

  if (!fs.existsSync(scraperPath)) {
    return response.status(400).json({ message: 'Scraper does not exist' });
  }

  const useProxy = request.query.useProxy === 'true';

  const scraper = require(scraperPath);
  const BrowserService = require('./services/BrowserService');

  const browser = await BrowserService.getBrowser(useProxy);

  console.log(`Running ${request.query.type} scrapper`);

  try {
    const result = await scraper.scrape(
      browser,
      request.query.url,
      useProxy,
    );

    return response.json(result);
  } catch (e) {
    console.log('Error while scraping', e.toString());

    response.status(500);

    return response.json({ message: e.toString() });
  } finally {
    await BrowserService.close();
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Running on http://${HOST}:${PORT}`);
});
