// Cypress E2E support file — loaded before every spec

import './commands'

// Silence uncaught exceptions from the app that aren't related to test logic
// (e.g. third-party script errors, React dev mode warnings)
Cypress.on('uncaught:exception', (err) => {
  // ResizeObserver loop errors are harmless browser noise
  if (err.message.includes('ResizeObserver loop')) return false
  // Allow the test to continue on unhandled promise rejections that aren't test failures
  if (err.message.includes('Non-Error promise rejection')) return false
  return true
})

// Log the test name before each test for easier debugging in CI logs
beforeEach(function () {
  const title = this.currentTest?.fullTitle()
  if (title) cy.log(`[TEST] ${title}`)
})
