const { defineConfig } = require('cypress')

module.exports = defineConfig({
  e2e: {
    // Base URL — override via CYPRESS_BASE_URL env var in CI/Docker
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:3000',

    // Where specs live
    specPattern: 'cypress/e2e/**/*.cy.js',

    // Support file
    supportFile: 'cypress/support/e2e.js',

    // Fixtures base path
    fixturesFolder: 'cypress/fixtures',

    // Screenshots on failure
    screenshotOnRunFailure: true,
    screenshotsFolder: 'cypress/screenshots',

    // Video recording (disable in fast local runs, enable in CI)
    video: process.env.CI === 'true',
    videosFolder: 'cypress/videos',

    // Retry failed tests in CI — reduces flakiness from network timing
    retries: {
      runMode: 2,   // cypress run (CI)
      openMode: 0,  // cypress open (interactive)
    },

    // Default timeouts (ms)
    defaultCommandTimeout: 8000,
    pageLoadTimeout: 30000,
    requestTimeout: 10000,
    responseTimeout: 10000,

    // Viewport
    viewportWidth: 1280,
    viewportHeight: 800,

    // Environment variables accessible via Cypress.env()
    env: {
      // API base URL — used in custom commands for direct API calls
      apiUrl: process.env.CYPRESS_API_URL || 'http://localhost:8000',
    },

    setupNodeEvents(on, config) {
      // Log failed tests to console
      on('after:run', (results) => {
        if (results && results.totalFailed > 0) {
          console.error(`\n[QA] ${results.totalFailed} test(s) failed.`)
        }
      })

      return config
    },
  },
})
