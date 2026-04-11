// Legal modals and misc modals E2E tests
// Covers: Privacy modal, Terms modal (open, scroll, close)
// Also covers language switching via the user dropdown

describe('Legal modals', () => {
  beforeEach(() => {
    cy.clearAuth()
    cy.intercept('GET', '**/featured-images*', { statusCode: 200, body: [] })
    cy.intercept('GET', '**/fx*', { statusCode: 200, body: { brl_per_usd: 5.0 } })
    cy.visit('/')
  })

  context('Privacy modal', () => {
    it('opens the Privacy modal from the footer link', () => {
      cy.get('[data-testid="footer-privacy-btn"]').click()
      cy.get('[data-testid="privacy-modal"]').should('be.visible')
      cy.get('[data-testid="privacy-modal"] .modal-title').should('contain.text', 'Privacidade')
    })

    it('closes the Privacy modal with the X button', () => {
      cy.get('[data-testid="footer-privacy-btn"]').click()
      cy.get('[data-testid="privacy-modal"]').should('be.visible')
      cy.get('[data-testid="privacy-modal"] .modal-close').click()
      cy.get('[data-testid="privacy-modal"]').should('not.be.visible')
    })

    it('Privacy modal contains required LGPD content', () => {
      cy.get('[data-testid="footer-privacy-btn"]').click()
      cy.get('[data-testid="privacy-modal"] .modal-body').within(() => {
        cy.contains('LGPD').should('exist')
        cy.contains('art. 18').should('exist')
      })
    })
  })

  context('Terms modal', () => {
    it('opens the Terms modal from the footer link', () => {
      cy.get('[data-testid="footer-terms-btn"]').click()
      cy.get('[data-testid="terms-modal"]').should('be.visible')
      cy.get('[data-testid="terms-modal"] .modal-title').should('contain.text', 'Termos')
    })

    it('closes the Terms modal with the X button', () => {
      cy.get('[data-testid="footer-terms-btn"]').click()
      cy.get('[data-testid="terms-modal"]').should('be.visible')
      cy.get('[data-testid="terms-modal"] .modal-close').click()
      cy.get('[data-testid="terms-modal"]').should('not.be.visible')
    })

    it('Terms modal contains content about USD 500 limit', () => {
      cy.get('[data-testid="footer-terms-btn"]').click()
      cy.get('[data-testid="terms-modal"] .modal-body').within(() => {
        cy.contains('USD 500').should('exist')
      })
    })
  })

  context('Privacy modal opened from Register form', () => {
    it('can open Privacy modal from the register consent area', () => {
      cy.intercept('GET', '**/auth/me*', { statusCode: 401, body: {} })
      cy.get('[data-testid="auth-open-btn"]').click()
      cy.get('[data-testid="auth-tab-register"]').click()
      cy.get('[data-testid="register-privacy-link"]').click()
      cy.get('[data-testid="privacy-modal"]').should('be.visible')
      cy.get('[data-testid="privacy-modal"] .modal-close').click()
      // Register modal should still be open (not closed by privacy close)
      cy.get('[data-testid="auth-modal"]').should('be.visible')
    })

    it('can open Terms modal from the register consent area', () => {
      cy.intercept('GET', '**/auth/me*', { statusCode: 401, body: {} })
      cy.get('[data-testid="auth-open-btn"]').click()
      cy.get('[data-testid="auth-tab-register"]').click()
      cy.get('[data-testid="register-terms-link"]').click()
      cy.get('[data-testid="terms-modal"]').should('be.visible')
    })
  })
})

describe('Language switching', () => {
  beforeEach(() => {
    cy.clearAuth()
    cy.intercept('GET', '**/featured-images*', { statusCode: 200, body: [] })
    cy.intercept('GET', '**/fx*', { statusCode: 200, body: { brl_per_usd: 5.0 } })
    // Intercept auth/me so the dropdown is available even without real auth
    cy.intercept('GET', '**/auth/me', { statusCode: 401, body: {} })
    cy.intercept('GET', '**/auth/me/prefs', {
      statusCode: 200,
      body: { show_margin: false, tax_rates: null },
    })
    cy.intercept('POST', '**/auth/login', {
      statusCode: 200,
      body: { access_token: 'fake-jwt-lang-test', token_type: 'bearer' },
    })
    cy.intercept('GET', '**/auth/me/searches*', { statusCode: 200, body: [] })

    cy.visit('/')
  })

  it('switches the UI to English via user dropdown', () => {
    // Log in so user dropdown is accessible
    cy.intercept('GET', '**/auth/me', {
      statusCode: 200,
      body: {
        id: 1, email: 'qa@example.com', username: 'qauser',
        name: 'QA User', is_admin: false, created_at: '2026-01-01T00:00:00Z',
      },
    })
    cy.get('[data-testid="auth-open-btn"]').click()
    cy.loginViaModal('qa@example.com', 'qapassword123')
    cy.get('[data-testid="user-menu-trigger"]').click()
    cy.get('[data-testid="lang-btn-en"]').click()

    // The compare button should now show English text
    cy.get('[data-testid="search-btn"]').should('contain.text', 'Compare Prices')
  })

  it('switches the UI to Portuguese', () => {
    cy.intercept('GET', '**/auth/me', {
      statusCode: 200,
      body: {
        id: 1, email: 'qa@example.com', username: 'qauser',
        name: 'QA User', is_admin: false, created_at: '2026-01-01T00:00:00Z',
      },
    })
    cy.get('[data-testid="auth-open-btn"]').click()
    cy.loginViaModal('qa@example.com', 'qapassword123')
    cy.get('[data-testid="user-menu-trigger"]').click()
    cy.get('[data-testid="lang-btn-pt"]').click()

    cy.get('[data-testid="search-btn"]').should('contain.text', 'Comparar Preços')
  })

  it('switches the UI to Spanish', () => {
    cy.intercept('GET', '**/auth/me', {
      statusCode: 200,
      body: {
        id: 1, email: 'qa@example.com', username: 'qauser',
        name: 'QA User', is_admin: false, created_at: '2026-01-01T00:00:00Z',
      },
    })
    cy.get('[data-testid="auth-open-btn"]').click()
    cy.loginViaModal('qa@example.com', 'qapassword123')
    cy.get('[data-testid="user-menu-trigger"]').click()
    cy.get('[data-testid="lang-btn-es"]').click()

    cy.get('[data-testid="search-btn"]').should('contain.text', 'Comparar Precios')
  })

  it('persists language choice in localStorage', () => {
    cy.intercept('GET', '**/auth/me', {
      statusCode: 200,
      body: {
        id: 1, email: 'qa@example.com', username: 'qauser',
        name: 'QA User', is_admin: false, created_at: '2026-01-01T00:00:00Z',
      },
    })
    cy.get('[data-testid="auth-open-btn"]').click()
    cy.loginViaModal('qa@example.com', 'qapassword123')
    cy.get('[data-testid="user-menu-trigger"]').click()
    cy.get('[data-testid="lang-btn-en"]').click()

    cy.window().then((win) => {
      expect(win.localStorage.getItem('muamba_locale')).to.equal('en')
    })
  })
})
