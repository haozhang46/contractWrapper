import type { Page } from './types.ts'

/**
 * Page registry — stores and retrieves headless pages.
 * Pages can be added at startup (built-in) or dynamically at runtime.
 */
export class PageRegistry {
  private pages = new Map<string, Page>()

  /** Register one or more pages */
  register(...pages: Page[]): void {
    for (const page of pages) {
      this.pages.set(page.id, page)
    }
  }

  /** Get all registered pages (without schema for list views) */
  list(): Omit<Page, 'schema'>[] {
    return Array.from(this.pages.values()).map(({ schema: _, ...rest }) => rest)
  }

  /** Get a single page by id with full detail */
  get(id: string): Page | undefined {
    return this.pages.get(id)
  }

  /** Remove a page by id */
  unregister(id: string): boolean {
    return this.pages.delete(id)
  }

  /** Get total page count */
  get size(): number {
    return this.pages.size
  }
}

/** Singleton page registry */
export const pageRegistry = new PageRegistry()
