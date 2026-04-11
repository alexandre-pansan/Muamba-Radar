// Custom Cypress commands for Muamba Radar E2E tests

/**
 * Register a new user via the API directly (bypasses UI for test setup speed).
 * Stores the returned token in localStorage so subsequent page loads are authenticated.
 */
Cypress.Commands.add('apiRegister', (username, name, email, password) => {
  cy.request({
    method: 'POST',
    url: `${Cypress.env('apiUrl')}/auth/register`,
    body: { username, name, email, password },
    failOnStatusCode: false,
  }).then((res) => {
    if (res.status === 201) {
      window.localStorage.setItem('muamba_token', res.body.access_token)
    }
    return res
  })
})

/**
 * Login via API directly. Stores token in localStorage.
 */
Cypress.Commands.add('apiLogin', (identifier, password) => {
  cy.request({
    method: 'POST',
    url: `${Cypress.env('apiUrl')}/auth/login`,
    body: { identifier, password },
  }).then((res) => {
    expect(res.status).to.eq(200)
    window.localStorage.setItem('muamba_token', res.body.access_token)
    return res.body
  })
})

/**
 * Delete a user account via the API (cleanup after tests).
 * Requires a valid token to be present in localStorage.
 */
Cypress.Commands.add('apiDeleteAccount', () => {
  const token = window.localStorage.getItem('muamba_token')
  if (!token) return
  cy.request({
    method: 'DELETE',
    url: `${Cypress.env('apiUrl')}/auth/me`,
    headers: { Authorization: `Bearer ${token}` },
    failOnStatusCode: false,
  })
  window.localStorage.removeItem('muamba_token')
})

/**
 * Clear auth state (localStorage token) without hitting the API.
 */
Cypress.Commands.add('clearAuth', () => {
  window.localStorage.removeItem('muamba_token')
})

/**
 * Open the auth modal in the given tab ('login' | 'register').
 */
Cypress.Commands.add('openAuthModal', (tab = 'login') => {
  cy.get('[data-testid="auth-open-btn"]').click()
  if (tab === 'register') {
    cy.get('[data-testid="auth-tab-register"]').click()
  }
  cy.get('[data-testid="auth-modal"]').should('be.visible')
})

/**
 * Fill and submit the login form inside the auth modal.
 */
Cypress.Commands.add('loginViaModal', (identifier, password) => {
  cy.get('[data-testid="auth-tab-login"]').click()
  cy.get('[data-testid="login-identifier"]').clear().type(identifier)
  cy.get('[data-testid="login-password"]').clear().type(password)
  cy.get('[data-testid="login-submit"]').click()
})

/**
 * Fill and submit the register form inside the auth modal.
 */
Cypress.Commands.add('registerViaModal', (username, name, email, password) => {
  cy.get('[data-testid="auth-tab-register"]').click()
  cy.get('[data-testid="register-username"]').clear().type(username)
  if (name) cy.get('[data-testid="register-name"]').clear().type(name)
  cy.get('[data-testid="register-email"]').clear().type(email)
  cy.get('[data-testid="register-password"]').clear().type(password)
  cy.get('[data-testid="register-consent"]').check()
  cy.get('[data-testid="register-submit"]').click()
})

/**
 * Type a search query and submit it via the sidebar search form.
 */
Cypress.Commands.add('searchFor', (query) => {
  cy.get('[data-testid="search-input"]').clear().type(query)
  cy.get('[data-testid="search-btn"]').click()
})

/**
 * Wait for the search results to appear (loading scene gone, results section visible).
 */
Cypress.Commands.add('waitForResults', () => {
  cy.get('[data-testid="results-section"]', { timeout: 20000 }).should('not.have.class', 'is-loading')
})
