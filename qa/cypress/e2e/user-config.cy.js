// User config modal E2E tests
// Covers: open settings, change display name, change password, toggle show_margin pref,
//         tax rate saving, search history, data export button, delete account confirm flow

describe('User Config Modal', () => {
  const mockUser = {
    id: 1,
    email: 'qa_testuser@example.com',
    username: 'qa_testuser',
    name: 'QA Test User',
    is_admin: false,
    created_at: '2026-01-01T00:00:00Z',
  }

  const mockPrefs = { show_margin: false, tax_rates: null }

  beforeEach(() => {
    cy.clearAuth()
    cy.intercept('GET', '**/featured-images*', { statusCode: 200, body: [] })
    cy.intercept('GET', '**/fx*', { statusCode: 200, body: { brl_per_usd: 5.0 } })
    cy.intercept('GET', '**/auth/me/searches*', { statusCode: 200, body: [] })

    // Simulate already-logged-in state
    cy.intercept('POST', '**/auth/login', {
      statusCode: 200,
      body: { access_token: 'fake-jwt-config-tests', token_type: 'bearer' },
    })
    cy.intercept('GET', '**/auth/me', { statusCode: 200, body: mockUser }).as('me')
    cy.intercept('GET', '**/auth/me/prefs', { statusCode: 200, body: mockPrefs }).as('prefs')

    cy.visit('/')
    // Log in via modal so user state is set
    cy.get('[data-testid="auth-open-btn"]').click()
    cy.loginViaModal(mockUser.email, 'qapassword123')
    cy.get('[data-testid="user-menu-trigger"]').should('be.visible')
  })

  context('Opening the settings modal', () => {
    it('opens settings modal from user dropdown', () => {
      cy.get('[data-testid="user-menu-trigger"]').click()
      cy.get('[data-testid="user-dropdown-settings"]').click()
      cy.get('[data-testid="user-config-modal"]').should('be.visible')
    })

    it('pre-fills the name field with the current user name', () => {
      cy.get('[data-testid="user-menu-trigger"]').click()
      cy.get('[data-testid="user-dropdown-settings"]').click()
      cy.get('[data-testid="config-name-input"]').should('have.value', mockUser.name)
    })

    it('closes the settings modal with the X button', () => {
      cy.get('[data-testid="user-menu-trigger"]').click()
      cy.get('[data-testid="user-dropdown-settings"]').click()
      cy.get('[data-testid="user-config-modal"]').should('be.visible')
      cy.get('[data-testid="user-config-modal"] .modal-close').click()
      cy.get('[data-testid="user-config-modal"]').should('not.be.visible')
    })
  })

  context('Update display name', () => {
    beforeEach(() => {
      cy.intercept('PATCH', '**/auth/me', {
        statusCode: 200,
        body: { ...mockUser, name: 'QA Updated Name' },
      }).as('updateMe')
    })

    it('saves a new display name and shows success feedback', () => {
      cy.get('[data-testid="user-menu-trigger"]').click()
      cy.get('[data-testid="user-dropdown-settings"]').click()

      cy.get('[data-testid="config-name-input"]').clear().type('QA Updated Name')
      cy.get('[data-testid="config-save-name-btn"]').click()
      cy.wait('@updateMe')

      // Confirm button shows saved state
      cy.get('[data-testid="config-save-name-btn"]').should('contain.text', 'Salvo')
    })
  })

  context('Change password', () => {
    beforeEach(() => {
      cy.intercept('PATCH', '**/auth/me', {
        statusCode: 200,
        body: mockUser,
      }).as('updatePassword')
    })

    it('shows mismatch error when passwords do not match', () => {
      cy.get('[data-testid="user-menu-trigger"]').click()
      cy.get('[data-testid="user-dropdown-settings"]').click()

      cy.get('[data-testid="config-new-password"]').type('newpassword123')
      cy.get('[data-testid="config-confirm-password"]').type('differentpassword')
      cy.get('[data-testid="config-save-password-btn"]').click()

      cy.get('[data-testid="password-error"]').should('be.visible')
      cy.get('[data-testid="password-error"]').should('contain.text', "não coincidem")
    })

    it('saves a new password when both fields match', () => {
      cy.get('[data-testid="user-menu-trigger"]').click()
      cy.get('[data-testid="user-dropdown-settings"]').click()

      cy.get('[data-testid="config-new-password"]').type('newpassword123')
      cy.get('[data-testid="config-confirm-password"]').type('newpassword123')
      cy.get('[data-testid="config-save-password-btn"]').click()
      cy.wait('@updatePassword')

      cy.get('[data-testid="config-save-password-btn"]').should('contain.text', 'Salvo')
    })
  })

  context('Show margin preference toggle', () => {
    beforeEach(() => {
      cy.intercept('PATCH', '**/auth/me/prefs', {
        statusCode: 200,
        body: { show_margin: true, tax_rates: null },
      }).as('updatePrefs')
    })

    it('toggles the show_margin preference', () => {
      cy.get('[data-testid="user-menu-trigger"]').click()
      cy.get('[data-testid="user-dropdown-settings"]').click()

      cy.get('[data-testid="pref-show-margin"]').should('not.be.checked')
      cy.get('[data-testid="pref-show-margin"]').check()
      cy.wait('@updatePrefs')

      cy.get('[data-testid="pref-show-margin"]').should('be.checked')
    })
  })

  context('Tax rates', () => {
    beforeEach(() => {
      cy.intercept('PATCH', '**/auth/me/prefs', {
        statusCode: 200,
        body: { show_margin: false, tax_rates: { credit_na_hora: 0.06 } },
      }).as('saveTax')
    })

    it('saves tax rates', () => {
      cy.get('[data-testid="user-menu-trigger"]').click()
      cy.get('[data-testid="user-dropdown-settings"]').click()

      cy.get('[data-testid="config-save-tax-btn"]').click()
      cy.wait('@saveTax')

      cy.get('[data-testid="config-save-tax-btn"]').should('contain.text', 'Salvo')
    })
  })

  context('Search history section', () => {
    it('shows recent searches when present', () => {
      cy.intercept('GET', '**/auth/me/searches*', {
        statusCode: 200,
        body: [
          { query: 'iphone 15', searched_at: '2026-04-10T10:00:00Z' },
          { query: 'samsung s24', searched_at: '2026-04-09T09:00:00Z' },
        ],
      }).as('searches')

      cy.get('[data-testid="user-menu-trigger"]').click()
      cy.get('[data-testid="user-dropdown-settings"]').click()

      cy.wait('@searches')
      cy.get('[data-testid="ucm-search-list"] [data-testid="ucm-search-item"]').should('have.length', 2)
    })
  })

  context('LGPD / Privacy section', () => {
    it('shows Export and Delete Account buttons', () => {
      cy.get('[data-testid="user-menu-trigger"]').click()
      cy.get('[data-testid="user-dropdown-settings"]').click()

      cy.get('[data-testid="config-export-btn"]').should('be.visible')
      cy.get('[data-testid="config-delete-btn"]').should('be.visible')
    })

    it('shows confirmation step before deleting account', () => {
      cy.get('[data-testid="user-menu-trigger"]').click()
      cy.get('[data-testid="user-dropdown-settings"]').click()

      cy.get('[data-testid="config-delete-btn"]').click()
      cy.get('[data-testid="config-delete-confirm"]').should('be.visible')
      cy.get('[data-testid="config-delete-cancel"]').should('be.visible')
    })

    it('can cancel the delete confirmation', () => {
      cy.get('[data-testid="user-menu-trigger"]').click()
      cy.get('[data-testid="user-dropdown-settings"]').click()

      cy.get('[data-testid="config-delete-btn"]').click()
      cy.get('[data-testid="config-delete-cancel"]').click()
      cy.get('[data-testid="config-delete-confirm"]').should('not.exist')
      cy.get('[data-testid="config-delete-btn"]').should('be.visible')
    })
  })
})
