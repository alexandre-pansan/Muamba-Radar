// Auth flow E2E tests
// Covers: open auth modal, login, register, logout, error states

const uniqueSuffix = () => Date.now()

describe('Auth flow', () => {
  beforeEach(() => {
    cy.clearAuth()
    // Intercept non-auth network calls to keep tests focused
    cy.intercept('GET', '**/featured-images*', { statusCode: 200, body: [] })
    cy.intercept('GET', '**/fx*', { statusCode: 200, body: { brl_per_usd: 5.0 } })
    cy.intercept('GET', '**/auth/me/searches*', { statusCode: 200, body: [] })
    cy.visit('/')
  })

  context('Auth modal open/close', () => {
    it('opens auth modal when clicking the login button', () => {
      cy.get('[data-testid="auth-open-btn"]').click()
      cy.get('[data-testid="auth-modal"]').should('be.visible')
    })

    it('shows login tab by default', () => {
      cy.get('[data-testid="auth-open-btn"]').click()
      cy.get('[data-testid="auth-tab-login"]').should('have.class', 'is-active')
      cy.get('[data-testid="login-identifier"]').should('be.visible')
    })

    it('switches to register tab', () => {
      cy.get('[data-testid="auth-open-btn"]').click()
      cy.get('[data-testid="auth-tab-register"]').click()
      cy.get('[data-testid="auth-tab-register"]').should('have.class', 'is-active')
      cy.get('[data-testid="register-username"]').should('be.visible')
    })

    it('closes auth modal with X button', () => {
      cy.get('[data-testid="auth-open-btn"]').click()
      cy.get('[data-testid="auth-modal"]').should('be.visible')
      cy.get('[data-testid="auth-modal"] .modal-close').click()
      cy.get('[data-testid="auth-modal"]').should('not.be.visible')
    })
  })

  context('Login — mocked success', () => {
    beforeEach(() => {
      cy.intercept('POST', '**/auth/login', {
        statusCode: 200,
        body: { access_token: 'fake-jwt-token-for-tests', token_type: 'bearer' },
      }).as('loginRequest')

      cy.intercept('GET', '**/auth/me', {
        statusCode: 200,
        body: {
          id: 1,
          email: 'qa_testuser@example.com',
          username: 'qa_testuser',
          name: 'QA Test User',
          is_admin: false,
          created_at: '2026-01-01T00:00:00Z',
        },
      }).as('meRequest')

      cy.intercept('GET', '**/auth/me/prefs', {
        statusCode: 200,
        body: { show_margin: false, tax_rates: null },
      }).as('prefsRequest')
    })

    it('logs in with valid credentials and shows user name in header', () => {
      cy.fixture('user').then((user) => {
        cy.get('[data-testid="auth-open-btn"]').click()
        cy.loginViaModal(user.login.identifier, user.login.password)
        cy.wait('@loginRequest')

        // Modal should close
        cy.get('[data-testid="auth-modal"]').should('not.be.visible')

        // User's name or email should appear in the header
        cy.get('[data-testid="user-menu-trigger"]').should('be.visible')
      })
    })

    it('sets the token in localStorage after login', () => {
      cy.fixture('user').then((user) => {
        cy.get('[data-testid="auth-open-btn"]').click()
        cy.loginViaModal(user.login.identifier, user.login.password)
        cy.wait('@loginRequest')

        cy.window().then((win) => {
          expect(win.localStorage.getItem('muamba_token')).to.equal('fake-jwt-token-for-tests')
        })
      })
    })
  })

  context('Login — mocked error', () => {
    it('shows error message on invalid credentials', () => {
      cy.intercept('POST', '**/auth/login', {
        statusCode: 401,
        body: { detail: 'Invalid credentials' },
      }).as('loginFail')

      cy.get('[data-testid="auth-open-btn"]').click()
      cy.loginViaModal('bad@example.com', 'wrongpassword')
      cy.wait('@loginFail')

      cy.get('[data-testid="login-error"]').should('be.visible').and('contain.text', 'Invalid credentials')
    })
  })

  context('Register — mocked success', () => {
    beforeEach(() => {
      cy.intercept('POST', '**/auth/register', {
        statusCode: 201,
        body: { access_token: 'fake-jwt-register-token', token_type: 'bearer' },
      }).as('registerRequest')

      cy.intercept('GET', '**/auth/me', {
        statusCode: 200,
        body: {
          id: 2,
          email: 'newuser@example.com',
          username: 'newuser',
          name: 'New User',
          is_admin: false,
          created_at: '2026-04-10T00:00:00Z',
        },
      }).as('meRequest')

      cy.intercept('GET', '**/auth/me/prefs', {
        statusCode: 200,
        body: { show_margin: false, tax_rates: null },
      })
    })

    it('registers a new account and closes the modal', () => {
      cy.get('[data-testid="auth-open-btn"]').click()
      cy.registerViaModal('newuser', 'New User', 'newuser@example.com', 'password123')
      cy.wait('@registerRequest')

      cy.get('[data-testid="auth-modal"]').should('not.be.visible')
      cy.get('[data-testid="user-menu-trigger"]').should('be.visible')
    })
  })

  context('Register — validation', () => {
    it('requires consent checkbox before registration is submitted', () => {
      cy.intercept('POST', '**/auth/register').as('registerAttempt')

      cy.get('[data-testid="auth-open-btn"]').click()
      cy.get('[data-testid="auth-tab-register"]').click()
      cy.get('[data-testid="register-username"]').type('someuser')
      cy.get('[data-testid="register-email"]').type('someuser@example.com')
      cy.get('[data-testid="register-password"]').type('password123')
      // Do NOT check the consent checkbox — submit button should be disabled
      cy.get('[data-testid="register-submit"]').should('be.disabled')
    })
  })

  context('Register — mocked error (duplicate email)', () => {
    it('shows conflict error when email is already taken', () => {
      cy.intercept('POST', '**/auth/register', {
        statusCode: 409,
        body: { detail: 'Email already registered' },
      }).as('registerConflict')

      cy.get('[data-testid="auth-open-btn"]').click()
      cy.get('[data-testid="auth-tab-register"]').click()
      cy.registerViaModal('dupuser', 'Dup User', 'qa_testuser@example.com', 'password123')
      cy.wait('@registerConflict')

      cy.get('[data-testid="register-error"]').should('be.visible').and('contain.text', 'Email already registered')
    })
  })

  context('Logout', () => {
    beforeEach(() => {
      // Seed auth state directly
      cy.intercept('POST', '**/auth/login', {
        statusCode: 200,
        body: { access_token: 'fake-jwt-token-for-tests', token_type: 'bearer' },
      })
      cy.intercept('GET', '**/auth/me', {
        statusCode: 200,
        body: {
          id: 1,
          email: 'qa_testuser@example.com',
          username: 'qa_testuser',
          name: 'QA Test User',
          is_admin: false,
          created_at: '2026-01-01T00:00:00Z',
        },
      })
      cy.intercept('GET', '**/auth/me/prefs', {
        statusCode: 200,
        body: { show_margin: false, tax_rates: null },
      })

      cy.fixture('user').then((user) => {
        cy.get('[data-testid="auth-open-btn"]').click()
        cy.loginViaModal(user.login.identifier, user.login.password)
        cy.get('[data-testid="user-menu-trigger"]').should('be.visible')
      })
    })

    it('logs out and returns to logged-out state', () => {
      cy.get('[data-testid="user-menu-trigger"]').click()
      cy.get('[data-testid="user-dropdown-logout"]').click()

      // Token cleared from localStorage
      cy.window().then((win) => {
        expect(win.localStorage.getItem('muamba_token')).to.be.null
      })

      // Login button should be visible again
      cy.get('[data-testid="auth-open-btn"]').should('be.visible')
    })
  })
})
