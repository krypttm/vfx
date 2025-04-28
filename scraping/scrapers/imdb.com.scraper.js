const axios = require('axios');
const cheerio = require('cheerio');
const BrowserService = require('../services/BrowserService');

module.exports = {
  async scrape(browser, url) {
    const page = await BrowserService.getPage(browser);

    await page.setExtraHTTPHeaders({
      'Accept-Language': process.env.BROWSER_LANG.split(';').shift(),
    });

    url = url.replace(/\/$/, '');

    if (!url.endsWith('fullcredits')) {
      url = `${url}/fullcredits`;
    }

    await page.goto(url);

    const data = await page.evaluate(() => {
      const data = [];

      const $container = document.querySelector('#filmography');
      const $headers = $container.querySelectorAll('.head');

      Array.from($headers).forEach(($header) => {
        const filmography = [];

        const category = $header.dataset.category;
        const title = $header.querySelector(`a[name=${category}]`).textContent.trim();
        const $filmography = $header.nextElementSibling.querySelectorAll('.filmo-row');

        Array.from($filmography).forEach(($film) => {
          const $link = $film.querySelector('b a[href^="/title/tt"]');

          let year = parseInt($film.querySelector('span.year_column').textContent.trim());
          const title = $link.textContent.trim();
          const link = $link.href.trim();
          const episodes = [];

          let role = '';
          let startCollectRole = false;
          const childNodes = Array.from($film.childNodes);

          for (let i = 0; i < childNodes.length; i++) {
            const $childNode = childNodes[i];

            if ($childNode.nodeName === 'BR') {
              startCollectRole = true;
            }

            if (startCollectRole && $childNode.nodeName === '#text') {
              if ($childNode.nodeValue.trim() !== '') {
                role = $childNode.nodeValue.trim();
              }

              continue;
            }

            if ($childNode.nodeName === 'DIV' && $childNode.classList.contains('filmo-episodes')) {
              break;
            }
          }

          const $episodes = $film.querySelectorAll('.filmo-episodes');

          Array.from($episodes).forEach(($episode) => {
            const $link = $episode.querySelector('a');
            const info = $episode.childNodes[$episode.childNodes.length - 1].nodeValue.trim()?.replace(/\n/g, ' ')?.trim().split(' ... ');

            const episode = {
              title: $link.textContent.trim(),
              link: $link.href.trim(),
            };

            if (info.length > 0) {
              if (/(\d{4,})/.test(info[0])) {
                episode.year = parseInt(info[0].replace(/\D/g, '').trim());

                if (info.length >= 2) {
                  episode.details = info[1];
                }
              } else {
                episode.details = info[0];
              }
            }

            episodes.push(episode);
          });

          if (!year && episodes.length > 0) {
            const years = episodes
              .filter((episode) => episode.year)
              .map((episode) => episode.year)
              .sort();

            const minYear = Math.min(...years);
            const maxYear = Math.max(...years);

            if (minYear === maxYear) {
              year = minYear;
            } else {
              year = `${minYear} - ${maxYear}`;
            }
          }

          filmography.push({
            title,
            year,
            link,
            role,
            episodes,
          });
        });

        data.push({
          title,
          filmography,
        });
      });

      return data;
    });

    for (const key in data) {
      for (const filmographyKey in data[key].filmography) {
        data[key].filmography[filmographyKey].poster = await this.getPoster(
          page,
          data[key].filmography[filmographyKey].link,
        );
      }
    }

    return data;
  },

  async getPoster(page, link, attempt = 0) {
    const maxAttempts = 3;

    try {
      const { data } = await axios.get(link, { headers: { 'User-Agent': process.env.BROWSER_PAGE_USER_AGENT } });

      const $ = cheerio.load(data);

      return JSON.parse($('script[type="application/ld+json"]').text()).image;
    } catch (e) {
      if (attempt === maxAttempts) {
        return null;
      }

      return this.getPoster(page, link, ++attempt);
    }
  },
};
