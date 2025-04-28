const fs = require('fs');

module.exports = {
  randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + max);
  },

  async sleep(seconds) {
    return await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  },

  async asyncCallWithTimeout(asyncPromise, timeoutMs = 1000) {
    let timeoutHandle;

    const timeoutPromise = new Promise((resolve, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error('Async call timeout limit reached')),
        timeoutMs,
      );
    });

    return Promise.race([asyncPromise, timeoutPromise]).then((result) => {
      clearTimeout(timeoutHandle);

      return result;
    })
  },

  async saveCookies(page, name) {
    const cookies = await page.cookies();

    await fs.writeFileSync(`./cookies/${name}.json`, JSON.stringify(cookies, null, 2));
  },

  async reuseCookies(page, name) {
    const cookiesFile = `./cookies/${name}.json`;

    if (!fs.existsSync(cookiesFile)) {
      return false;
    }

    const cookiesString = await fs.readFileSync(cookiesFile);
    const cookies = JSON.parse(cookiesString);

    await page.setCookie(...cookies);

    return true;
  },
};
