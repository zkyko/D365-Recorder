import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Playwright configuration for BrowserStack execution
 * Uses Chrome DevTools Protocol (CDP) to connect to BrowserStack
 */
export default defineConfig({
  testDir: './Recordings/tests',
  
  /* Run tests sequentially on BrowserStack */
  fullyParallel: false,
  workers: 1,
  
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  
  /* Shared settings for all the projects below. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.D365_URL || 'https://fourhands-test.sandbox.operations.dynamics.com/',
    
    /* Collect trace when retrying the failed test. */
    trace: 'on-first-retry',
    
    /* Use storage state for D365 authentication - from environment variable or default */
    /* Note: For BrowserStack, ensure BrowserStack Local Testing is enabled (browserstack.local: 'true') */
    storageState: process.env.STORAGE_STATE_PATH || 'storage_state/d365.json',
    
    /* D365 requires full desktop viewport to avoid mobile layout */
    viewport: { width: 1920, height: 1080 },
  },

  /* Configure projects for BrowserStack */
  projects: [
    {
      name: 'chromium-browserstack',
      use: {
        ...devices['Desktop Chrome'],
        // BrowserStack connection via CDP
        connectOptions: {
          wsEndpoint: getBrowserStackEndpoint(),
        },
        // Override viewport for D365
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],
});

/**
 * Construct BrowserStack CDP endpoint URL
 * Requires BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY environment variables
 */
function getBrowserStackEndpoint(): string {
  const username = process.env.BROWSERSTACK_USERNAME;
  const accessKey = process.env.BROWSERSTACK_ACCESS_KEY;

  if (!username || !accessKey) {
    throw new Error(
      'BrowserStack credentials not found. Please set BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY environment variables.'
    );
  }

  // BrowserStack CDP endpoint format
  // See: https://www.browserstack.com/docs/automate/playwright
  // Enable Local Testing to access local storage state file
  const enableLocalTesting = process.env.BROWSERSTACK_LOCAL === 'true';
  
  const caps = {
    browserName: 'Chrome',
    browserVersion: 'latest',
    os: 'Windows',
    osVersion: '11',
    name: 'D365 Test Execution',
    build: `D365-Recorder-${new Date().toISOString().split('T')[0]}`,
    'browserstack.username': username,
    'browserstack.accessKey': accessKey,
    'browserstack.local': enableLocalTesting ? 'true' : 'false',
    'browserstack.networkLogs': 'true',
    'browserstack.console': 'info',
  };

  // Encode capabilities as base64
  const capsString = Buffer.from(JSON.stringify(caps)).toString('base64');
  
  return `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(capsString)}`;
}

