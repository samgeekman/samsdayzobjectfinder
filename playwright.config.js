/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: './tests',
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:1314',
    headless: true
  }
};
