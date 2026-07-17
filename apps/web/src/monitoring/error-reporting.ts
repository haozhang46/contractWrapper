/**
 * Structured frontend error reporting.
 * Dev: console only. Prod: sendBeacon to /api/log/error.
 */

interface ErrorPayload {
  type: string
  message?: string
  stack?: string
  [key: string]: unknown
}

function reportError(payload: ErrorPayload): void {
  if (import.meta.env.DEV) {
    console.error('[ErrorReport]', payload)
    return
  }

  const body = JSON.stringify({
    ...payload,
    url: window.location.href,
    timestamp: Date.now(),
    userAgent: navigator.userAgent,
  })

  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/log/error', body)
  } else {
    fetch('/api/log/error', {
      method: 'POST',
      body,
      keepalive: true,
    }).catch(() => {})
  }
}

// --- Global handlers ---

export function initErrorReporting(): void {
  window.addEventListener('error', event => {
    // Resource load errors
    if (event.target && (event.target as HTMLElement).tagName) {
      reportError({
        type: 'RESOURCE_ERROR',
        tagName: (event.target as HTMLElement).tagName,
        src:
          (event.target as HTMLScriptElement).src ??
          (event.target as HTMLImageElement).src ??
          '',
        message: event.message,
      })
    }
  })

  window.addEventListener('unhandledrejection', event => {
    reportError({
      type: 'UNHANDLED_REJECTION',
      message: event.reason?.message ?? String(event.reason),
      stack: event.reason?.stack,
    })
  })
}

// --- React error boundary hook ---

export function captureComponentError(
  error: Error,
  info: { componentStack: string },
): void {
  reportError({
    type: 'REACT_ERROR',
    message: error.message,
    stack: error.stack,
    componentStack: info.componentStack,
  })
}

export { reportError }
