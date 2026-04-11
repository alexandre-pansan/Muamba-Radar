// Search flow E2E tests
// Covers: basic search, results display, offers dialog, empty state, stale badge

describe('Search flow', () => {
  beforeEach(() => {
    cy.clearAuth()
    cy.visit('/')
  })

  context('Happy path — mocked API response', () => {
    beforeEach(() => {
      cy.fixture('products').then((products) => {
        // Intercept the /compare endpoint and return mock data
        cy.intercept('GET', '**/compare*', {
          statusCode: 200,
          headers: { 'X-Cache': 'MISS' },
          body: products.mockCompareResponse,
        }).as('compareRequest')

        // Intercept suggestions to return empty (keep test hermetic)
        cy.intercept('GET', '**/suggestions*', { statusCode: 200, body: [] }).as('suggestionsRequest')

        // Intercept featured images
        cy.intercept('GET', '**/featured-images*', { statusCode: 200, body: [] }).as('featuredImages')

        // Intercept fx rate
        cy.intercept('GET', '**/fx*', { statusCode: 200, body: { brl_per_usd: 5.0 } }).as('fxRate')
      })
    })

    it('shows the search input and compare button on load', () => {
      cy.get('[data-testid="search-input"]').should('be.visible')
      cy.get('[data-testid="search-btn"]').should('be.visible').and('contain.text', 'Comparar')
    })

    it('submits a search query and displays product cards', () => {
      cy.fixture('products').then((products) => {
        cy.searchFor(products.searchQuery)
        cy.wait('@compareRequest')

        // Status bar should reflect found results
        cy.get('[data-testid="status-text"]').should('contain', '2')

        // Product cards should be rendered
        cy.get('[data-testid="product-card"]').should('have.length.at.least', 1)

        // First card should show product name
        cy.get('[data-testid="product-card"]').first().within(() => {
          cy.get('[data-testid="card-name"]').should('contain.text', 'iPhone 15')
        })
      })
    })

    it('shows PY and BR price rows on a product card', () => {
      cy.fixture('products').then((products) => {
        cy.searchFor(products.searchQuery)
        cy.wait('@compareRequest')

        cy.get('[data-testid="product-card"]').first().within(() => {
          cy.get('[data-testid="card-row-py"]').should('be.visible')
          cy.get('[data-testid="card-row-br"]').should('be.visible')
        })
      })
    })

    it('opens the offers dialog when clicking the expand button', () => {
      cy.fixture('products').then((products) => {
        cy.searchFor(products.searchQuery)
        cy.wait('@compareRequest')

        cy.get('[data-testid="card-expand-btn"]').first().click()
        cy.get('[data-testid="offers-dialog"]').should('be.visible')

        // Table inside dialog should have rows
        cy.get('[data-testid="offers-dialog"] tbody tr').should('have.length.at.least', 1)
      })
    })

    it('closes the offers dialog with the close button', () => {
      cy.fixture('products').then((products) => {
        cy.searchFor(products.searchQuery)
        cy.wait('@compareRequest')

        cy.get('[data-testid="card-expand-btn"]').first().click()
        cy.get('[data-testid="offers-dialog"]').should('be.visible')
        cy.get('[data-testid="offers-dialog"] .modal-close').click()
        cy.get('[data-testid="offers-dialog"]').should('not.exist')
      })
    })

    it('pressing Enter in the search input also submits', () => {
      cy.fixture('products').then((products) => {
        cy.get('[data-testid="search-input"]').type(`${products.searchQuery}{enter}`)
        cy.wait('@compareRequest')
        cy.get('[data-testid="product-card"]').should('have.length.at.least', 1)
      })
    })

    it('shows the Clear button after results are displayed', () => {
      cy.fixture('products').then((products) => {
        cy.searchFor(products.searchQuery)
        cy.wait('@compareRequest')
        cy.get('[data-testid="btn-clear"]').should('be.visible')
      })
    })

    it('clears results when Clear button is clicked', () => {
      cy.fixture('products').then((products) => {
        cy.searchFor(products.searchQuery)
        cy.wait('@compareRequest')
        cy.get('[data-testid="btn-clear"]').click()
        cy.get('[data-testid="product-card"]').should('not.exist')
      })
    })

    it('can switch to table view', () => {
      cy.fixture('products').then((products) => {
        cy.searchFor(products.searchQuery)
        cy.wait('@compareRequest')
        cy.get('[data-testid="view-table-btn"]').click()
        cy.get('[data-testid="flat-table"]').should('be.visible')
        cy.get('[data-testid="flat-table"] tbody tr').should('have.length.at.least', 1)
      })
    })

    it('can switch back to card view', () => {
      cy.fixture('products').then((products) => {
        cy.searchFor(products.searchQuery)
        cy.wait('@compareRequest')
        cy.get('[data-testid="view-table-btn"]').click()
        cy.get('[data-testid="view-card-btn"]').click()
        cy.get('[data-testid="product-card"]').should('have.length.at.least', 1)
      })
    })

    it('shows FALLBACK/stale badge when X-Cache header is FALLBACK', () => {
      cy.fixture('products').then((products) => {
        cy.intercept('GET', '**/compare*', {
          statusCode: 200,
          headers: { 'X-Cache': 'FALLBACK' },
          body: products.mockCompareResponse,
        }).as('compareStale')

        cy.searchFor(products.searchQuery)
        cy.wait('@compareStale')
        cy.get('[data-testid="badge-stale"]').should('be.visible')
      })
    })
  })

  context('Empty state — no results', () => {
    beforeEach(() => {
      cy.fixture('products').then((products) => {
        cy.intercept('GET', '**/compare*', {
          statusCode: 200,
          body: products.mockEmptyResponse,
        }).as('emptyCompare')
        cy.intercept('GET', '**/suggestions*', { statusCode: 200, body: [] })
        cy.intercept('GET', '**/featured-images*', { statusCode: 200, body: [] })
        cy.intercept('GET', '**/fx*', { statusCode: 200, body: { brl_per_usd: 5.0 } })
      })
    })

    it('shows empty state message when no results are returned', () => {
      cy.fixture('products').then((products) => {
        cy.searchFor(products.emptyQuery)
        cy.wait('@emptyCompare')
        cy.get('[data-testid="empty-state"]').should('be.visible')
        cy.get('[data-testid="status-text"]').should('contain', 'Nenhuma')
      })
    })
  })

  context('Error state', () => {
    it('shows error status and retry button when API request fails', () => {
      cy.intercept('GET', '**/compare*', { forceNetworkError: true }).as('compareError')
      cy.intercept('GET', '**/suggestions*', { statusCode: 200, body: [] })
      cy.intercept('GET', '**/featured-images*', { statusCode: 200, body: [] })
      cy.intercept('GET', '**/fx*', { statusCode: 200, body: { brl_per_usd: 5.0 } })

      cy.fixture('products').then((products) => {
        cy.searchFor(products.searchQuery)
        cy.wait('@compareError')
        cy.get('[data-testid="status-text"]').should('contain.text', 'Erro')
        cy.get('[data-testid="btn-retry"]').should('be.visible')
      })
    })
  })

  context('Autocomplete suggestions', () => {
    it('shows suggestion dropdown when typing', () => {
      cy.intercept('GET', '**/suggestions*', {
        statusCode: 200,
        body: ['iphone 15', 'iphone 15 pro', 'iphone 15 plus'],
      }).as('suggestions')
      cy.intercept('GET', '**/featured-images*', { statusCode: 200, body: [] })
      cy.intercept('GET', '**/fx*', { statusCode: 200, body: { brl_per_usd: 5.0 } })

      cy.get('[data-testid="search-input"]').type('iph')
      cy.wait('@suggestions')
      cy.get('.suggestions-list').should('be.visible')
      cy.get('.suggestions-list li').should('have.length', 3)
    })
  })
})
