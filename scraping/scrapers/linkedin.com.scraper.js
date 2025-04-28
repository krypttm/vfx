const { ImapFlow } = require('imapflow');
const simpleParser = require('mailparser').simpleParser;
const cheerio = require('cheerio');
const BrowserService = require('../services/BrowserService');
const { sleep, saveCookies, reuseCookies } = require('../utilities');

module.exports = {
  companies: [],

  async scrape(browser, url, useProxy = false) {
    let result;
    let page = await BrowserService.getPage(browser, useProxy);

    await reuseCookies(page, 'linkedin');

    [page, result] = await this.goToPage(
      browser,
      useProxy,
      'https://www.linkedin.com/login',
      page,
    );

    if (!result) {
      throw new Error("Can't go to the login page");
    }

    if (page.url().split('/').filter((piece) => piece).pop() !== 'feed') {
      await page.evaluate(
        (username) => document.querySelector('#username').value = username,
        process.env.LINKEDIN_USERNAME,
      );

      await page.evaluate(
        (password) => document.querySelector('#password').value = password,
        process.env.LINKEDIN_PASSWORD,
      );

      await sleep(1);

      await page.click('button[type=submit]');

      await sleep(10);

      console.log('Logged in');

      const hasPhoneChallenge = await page.evaluate(() => {
        const hasChallenge = document.querySelector('.cp-challenge');
        const hasCountryCode = document.querySelector('#countryCodeValueId');
        const hasButton = document.querySelector('#password-prompt-wrapper');

        return null !== hasChallenge && null !== hasCountryCode && null !== hasButton;
      });

      if (hasPhoneChallenge) {
        console.log('Met phone challenge');

        await page.click('.cp-actions button[type=button]');

        try {
          await sleep(10);
          await page.waitForNetworkIdle({ timeout: 30 });
        } catch (e) {
          //
        }
      }

      if (/linkedin\.com\/checkpoint\/challenge/.test(page.url())) {
        console.log('Met verification code challenge');

        const verificationCode = await this.getVerificationCodeFromMail();

        if (!verificationCode) {
          throw new Error("Linkedin requires code confirmation. Can't proceed");
        }

        await page.evaluate(
          (verificationCode) => document.querySelector('input[name=pin]').value = verificationCode,
          verificationCode,
        );

        await page.click('button[type=submit]');

        try {
          await sleep(10);
          await page.waitForNetworkIdle({ timeout: 30 });
        } catch (e) {
          //
        }
      }
    } else {
      console.log('Logged in from cookies');
    }

    await saveCookies(page, 'linkedin');

    url = `${this.removeSubdomainFromUrl(url.replace(/\/$/, ''))}/details/experience/`;

    [page, result] = await this.goToPage(browser, useProxy, url, page);

    if (!result) {
      throw new Error("Can't go to the experience page");
    }

    try {
      await sleep(10);
      await page.waitForNetworkIdle({ timeout: 30 });
    } catch (e) {
      //
    }

    // Scroll down because there can be more than 20 items.
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;

        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight - window.innerHeight) {
            clearInterval(timer);

            resolve();
          }
        }, 400);
      });
    });

    const experiences = await page.evaluate(() => {
      const $experiences = document
        .querySelector('main.scaffold-layout__main .pvs-list__container ul.pvs-list')
        ?.querySelectorAll(':scope > li');

      if (!$experiences) {
        console.log("Can't get 'main' section");

        return [];
      }

      if (
        $experiences.length === 1 &&
        $experiences[0].querySelector('section.artdeco-empty-state') !== null
      ) {
        return [];
      }

      const experiences = [];

      const parsePositionMonths = (dates) => {
        if (!dates) {
          return null;
        }

        const monthsPeriod = dates.split(' · ').pop();

        if (!monthsPeriod) {
          return null;
        }

        const monthsPeriodMatch = monthsPeriod.match(/^((?<year>\d+)\syrs?\s?)?((?<month>\d+)\smos?)?$/);

        if (null === monthsPeriodMatch) {
          return null;
        }

        return (parseInt(monthsPeriodMatch.groups.year || 0) * 12) + parseInt(monthsPeriodMatch.groups.month || 0);
      };

      Array.from($experiences).forEach(($experience) => {
        const $entity = $experience.querySelector('.pvs-entity');
        const $secondColumn = $entity.querySelector('div.full-width');
        const $firstRow = $secondColumn.querySelector('div.display-flex');
        const $firstRowDetails = $firstRow.querySelectorAll(':scope > div > span');
        const $secondRow = $secondColumn.querySelector('div.pvs-list__outer-container');

        const $positionsList = $secondRow?.querySelector('.pvs-list__container > div.scaffold-finite-scroll');

        let company;
        let positions = [];

        if ($positionsList) {
          const $companyDetails = $firstRow.querySelectorAll(':scope > a > *');

          company = $companyDetails[0]?.querySelector('span[aria-hidden=true]')?.textContent.trim();

          Array.from($positionsList.querySelectorAll('.scaffold-finite-scroll__content > ul > li')).forEach(($position) => {
            const $entity = $position.querySelector('div.pvs-entity');
            const $secondColumn = $entity.querySelector('div.full-width');
            const $firstRow = $secondColumn.querySelector('div.display-flex > a');
            const $secondRow = $secondColumn.querySelector('div.pvs-list__outer-container');
            const $firstRowSpans = $firstRow.querySelectorAll(':scope > span');

            let employment = null;
            let dates;
            let location;

            if (!$firstRowSpans[0].classList.contains('t-black--light')) {
              employment = $firstRowSpans[0].querySelector('span[aria-hidden=true]')?.textContent.trim();
              dates = $firstRowSpans[1]?.querySelector('span[aria-hidden=true]')?.textContent?.trim();
              location = $firstRowSpans[2]?.querySelector('span[aria-hidden=true]')?.textContent?.trim();
            } else {
              dates = $firstRowSpans[0]?.querySelector('span[aria-hidden=true]')?.textContent?.trim();
              location = $firstRowSpans[1]?.querySelector('span[aria-hidden=true]')?.textContent?.trim();
            }

            positions.push({
              title: $firstRow.querySelector(':scope > div span[aria-hidden=true]').textContent.trim(),
              description: $secondRow?.querySelector('.pvs-list__outer-container > ul > li > div.display-flex span')?.textContent?.trim() || null,
              dates: dates || null,
              location: location || null,
              employment: employment || null,
              months: parsePositionMonths(dates || null),
            });
          });
        } else {
          let employment = null;

          company = $firstRowDetails[0]?.querySelector('span')?.textContent?.trim();

          if (company.includes(' · ')) {
            [company, employment] = company.split(' · ');
          }

          const dates = $firstRowDetails[1]?.querySelector('span')?.textContent?.trim() || null;

          positions.push({
            title: $firstRow.querySelector(':scope > div > div span[aria-hidden=true]').textContent.trim(),
            description: $secondRow?.querySelector('.pvs-list__outer-container > ul > li > div.display-flex span')?.textContent?.trim() || null,
            dates: dates,
            location: $firstRowDetails[2]?.querySelector('span')?.textContent?.trim() || null,
            employment,
            months: parsePositionMonths(dates),
          });
        }

        const image = $entity.querySelector('.pvs-entity__image img')?.src;

        experiences.push({
          image: image || null,
          company: company || null,
          positions: positions || null,
        });
      });

      return experiences;
    });

    await saveCookies(page, 'linkedin');

    return experiences;
  },

  async goToPage(browser, useProxy, url, page = null, attempt = 0) {
    console.log(`Trying to go to the url: ${url}. Attempt: ${attempt}`);

    const maxAttempts = 20;

    if (attempt === maxAttempts) {
      console.log('Exceeded count of attempts');

      return [null, false];
    }

    if (null === page) {
      page = await BrowserService.getPage(browser, useProxy);
    }

    try {
      const result = await page.goto(url);

      if (result.status() === 407) {
        console.log('407 error');

        return [null, false];
      }

      if (result.status() !== 200) {
        console.log('Did not get 200 status', result.status());

        return await this.goToPage(browser, useProxy, url, page, ++attempt);
      }

      return [page, true];
    } catch (e) {
      console.log(`Can't go to the page: ${url}. Attempt: ${attempt}. Message: ${e}`);

      return await this.goToPage(browser, useProxy, url, page, ++attempt);
    }
  },

  removeSubdomainFromUrl(url) {
    const urlWithoutScheme = url.replace(/https?:\/\//, '');
    const indexOfSlash = urlWithoutScheme.indexOf('/');
    const urlHost = urlWithoutScheme.substring(0, indexOfSlash);
    const urlPath = urlWithoutScheme.substring(indexOfSlash);
    const urlHostPieces = urlHost.split('.').filter((piece) => piece !== 'www');
    const firstPiece = urlHostPieces.shift();

    if (firstPiece !== 'linkedin') {
      return `https://${urlHostPieces.join('.')}${urlPath}`;
    }

    return url;
  },

  async getVerificationCodeFromMail() {
    const client = new ImapFlow({
      host: process.env.MAIL_IMAP_HOST,
      port: process.env.MAIL_IMAP_PORT,
      secure: process.env.MAIL_IMAP_SECURE === 'true',
      auth: {
        user: process.env.MAIL_IMAP_USER,
        pass: process.env.MAIL_IMAP_PASSWORD,
      },
      logger: false,
    });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    let code;

    const waitTimeout = 10 * 60 * 1000; // 10 minutes * 60 seconds * 1000 milliseconds
    const startedAt = new Date();

    try {
      while ((new Date()) - startedAt < waitTimeout) {
        if (code) {
          break;
        }

        for await (let message of client.fetch('*', { envelope: true, source: true })) {
          // @see https://github.com/postalsys/imapflow/issues/79#issuecomment-1168427553
          if (code) {
            continue;
          }

          if (message.envelope.from[0]?.address !== 'security-noreply@linkedin.com') {
            continue;
          }

          const parsed = await simpleParser(message.source);
          const $ = cheerio.load(parsed.html);

          $('h2').each((index, element) => {
            const text = $(element).text()?.trim();

            if (text && text.match(/^\d{6,}$/)) {
              code = text;
            }
          });
        }
      }
    } finally {
      lock.release();
    }

    try {
      await client.logout();
    } catch (e) {
      //
    }

    return code;
  },
};
