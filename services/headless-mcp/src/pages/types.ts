/**
 * Page types for the Headless MCP Service.
 *
 * A Page represents a UI capability — an interactive form/action that
 * can be rendered in the web UI or called programmatically by AI.
 */

/** JSON Schema definition for page form fields */
export interface PageSchema {
  type: 'object'
  title?: string
  description?: string
  properties: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean' | 'array' | 'object'
      title?: string
      description?: string
      enum?: string[]
      default?: unknown
      /** UI hint: which widget to render (text, select, checkbox, textarea, etc.) */
      uiWidget?: string
    }
  >
  required?: string[]
}

/** A backend request description derived from a page submission */
export interface PageRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  url: string
  headers?: Record<string, string>
  /** Maps form field names to request body keys */
  bodyMapping?: Record<string, string>
}

/** A page definition exposed via the Headless MCP Service */
export interface Page {
  /** Unique page identifier */
  id: string
  /** Hierarchical page ID for grouping */
  pageid: string
  /** Human-readable description of what this page does */
  description: string
  /** Prompt for AI when this page is relevant */
  prompt?: string
  /** Form schema for UI rendering */
  schema?: PageSchema
  /** Backend request description */
  request?: PageRequest
  /** Optional category for UI grouping */
  category?: string
}
