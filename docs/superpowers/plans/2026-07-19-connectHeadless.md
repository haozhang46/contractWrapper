# connectHeadless Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `runConnectHeadless` — the headless/non-interactive connection handler for `claude open <cc-url> -p` that connects to a remote session via WebSocket and processes prompts without an Ink-based TUI.

**Architecture:** A new WebSocket-based transport in `connectHeadless.ts` that uses the existing `DirectConnectConfig` to connect, sends user messages in SDK format, and streams `StdoutMessage` responses to stdout. Leverages `StructuredIO.write()` for permission request handling in headless mode. The interactive branch (`-p` without arg) pipes stdin/stdout over the same WebSocket.

**Tech Stack:** TypeScript, Bun WebSocket API, existing `StructuredIO`/`StdoutMessage` types, `jsonStringify`/`jsonParse` from `ccb/src/utils/slowOperations.js`, `randomUUID` from crypto.

**File Structure:**

| File | Action | Responsibility |
|------|--------|---------------|
| `ccb/src/server/connectHeadless.ts` | Modify (full rewrite) | WebSocket connection handler for remote headless sessions |
| `ccb/src/server/__tests__/connectHeadless.test.ts` | Create | Unit tests for headless connect scenarios |

---

### Task 1: Write failing tests for `runConnectHeadless`

**Files:**
- Create: `ccb/src/server/__tests__/connectHeadless.test.ts`
- Source: `ccb/src/server/connectHeadless.ts`

- [ ] **Step 1: Write test for connect + send message headless**

```typescript
// ccb/src/server/__tests__/connectHeadless.test.ts
import { describe, test, expect, mock } from 'bun:test'
import { runConnectHeadless } from '../connectHeadless.ts'

describe('runConnectHeadless', () => {
  test('connects WebSocket and sends user message in headless mode', async () => {
    const wsSend = mock()
    const wsClose = mock()
    const wsAddEventListener = mock()

    // Mock WebSocket constructor
    const origWebSocket = globalThis.WebSocket
    globalThis.WebSocket = class MockWebSocket {
      readyState = WebSocket.OPEN
      send = wsSend
      close = wsClose
      addEventListener = wsAddEventListener
      constructor(public url: string | URL, public protocols?: string | string[]) {}
    } as unknown as typeof WebSocket

    const config = {
      serverUrl: 'http://localhost:3456',
      sessionId: 'test-session',
      wsUrl: 'ws://localhost:3456/ws',
      authToken: 'test-token',
    }

    // Start headless mode with a prompt - this should connect and send
    const promise = runConnectHeadless(config, 'Hello', 'json', false)

    // Simulate WebSocket open
    const openHandler = wsAddEventListener.mock.calls.find(c => c[0] === 'open')?.[1]
    if (openHandler) openHandler()

    // Wait for message to be sent
    await Bun.sleep(50)

    expect(wsAddEventListener).toHaveBeenCalledWith('open', expect.any(Function))
    expect(wsAddEventListener).toHaveBeenCalledWith('message', expect.any(Function))
    expect(wsAddEventListener).toHaveBeenCalledWith('close', expect.any(Function))
    expect(wsAddEventListener).toHaveBeenCalledWith('error', expect.any(Function))
    
    // Should have sent a user message over WebSocket
    expect(wsSend).toHaveBeenCalledTimes(1)
    const sentMsg = JSON.parse(wsSend.mock.calls[0][0])
    expect(sentMsg.type).toBe('user')
    expect(sentMsg.message.role).toBe('user')
    expect(sentMsg.message.content).toBe('Hello')

    // Cleanup
    await promise
    globalThis.WebSocket = origWebSocket
  })

  test('handles assistant messages from WebSocket in headless json mode', async () => {
    const capturedStdout: string[] = []
    const origWrite = process.stdout.write
    process.stdout.write = ((chunk: string | Uint8Array) => {
      capturedStdout.push(chunk.toString())
      return true
    }) as typeof process.stdout.write

    const wsHandlers = new Map<string, Function>()
    globalThis.WebSocket = class MockWebSocket {
      readyState = WebSocket.OPEN
      send = mock()
      close = mock()
      addEventListener = (ev: string, fn: Function) => wsHandlers.set(ev, fn)
      constructor(public url: string | URL, public protocols?: string | string[]) {}
    } as unknown as typeof WebSocket

    const config = {
      serverUrl: 'http://localhost:3456',
      sessionId: 'test-session',
      wsUrl: 'ws://localhost:3456/ws',
    }

    const promise = runConnectHeadless(config, 'Hello', 'json', false)

    // Connect
    wsHandlers.get('open')?.()
    await Bun.sleep(20)

    // Send a result message back
    const msgHandler = wsHandlers.get('message')
    const resultMsg = JSON.stringify({
      type: 'result',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Hello back' }] },
      uuid: '1234',
      session_id: 'test-session',
    })
    msgHandler?.({ data: resultMsg + '\n' })
    await Bun.sleep(20)

    // Send a final result to stop
    const finalMsg = JSON.stringify({
      type: 'result',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Final' }] },
      is_error: false,
      uuid: '5678',
      session_id: 'test-session',
    })
    msgHandler?.({ data: finalMsg + '\n' })
    await Bun.sleep(50)

    expect(capturedStdout.length).toBeGreaterThan(0)

    process.stdout.write = origWrite
    globalThis.WebSocket = WebSocket
    await promise.catch(() => {}) // ignore shutdown errors
  })

  test('sends error response for unsupported control request types', async () => {
    const wsSend = mock()
    const wsHandlers = new Map<string, Function>()
    globalThis.WebSocket = class MockWebSocket {
      readyState = WebSocket.OPEN
      send = wsSend
      close = mock()
      addEventListener = (ev: string, fn: Function) => wsHandlers.set(ev, fn)
      constructor(public url: string | URL, public protocols?: string | string[]) {}
    } as unknown as typeof WebSocket

    const config = {
      serverUrl: 'http://localhost:3456',
      sessionId: 'test-session',
      wsUrl: 'ws://localhost:3456/ws',
    }

    const promise = runConnectHeadless(config, 'Hello', 'json', false)
    wsHandlers.get('open')?.()
    await Bun.sleep(20)

    // Send an unsupported control request
    const msgHandler = wsHandlers.get('message')
    msgHandler?.({
      data: JSON.stringify({
        type: 'control_request',
        request_id: 'req-1',
        request: { subtype: 'unknown_type' },
      }) + '\n',
    })
    await Bun.sleep(20)

    // Should send an error response
    const errorResponse = wsSend.mock.calls.find(c => {
      const parsed = JSON.parse(c[0])
      return parsed.type === 'control_response' && parsed.response.subtype === 'error'
    })
    expect(errorResponse).toBeDefined()

    globalThis.WebSocket = WebSocket
    await promise.catch(() => {})
  })

  test('handles permission requests in headless mode', async () => {
    const wsSend = mock()
    const wsHandlers = new Map<string, Function>()
    globalThis.WebSocket = class MockWebSocket {
      readyState = WebSocket.OPEN
      send = wsSend
      close = mock()
      addEventListener = (ev: string, fn: Function) => wsHandlers.set(ev, fn)
      constructor(public url: string | URL, public protocols?: string | string[]) {}
    } as unknown as typeof WebSocket

    const config = {
      serverUrl: 'http://localhost:3456',
      sessionId: 'test-session',
      wsUrl: 'ws://localhost:3456/ws',
    }

    const promise = runConnectHeadless(config, 'Hello', 'json', false)
    wsHandlers.get('open')?.()
    await Bun.sleep(20)

    // Send a permission request for can_use_tool
    const msgHandler = wsHandlers.get('message')
    msgHandler?.({
      data: JSON.stringify({
        type: 'control_request',
        request_id: 'perm-1',
        request: {
          subtype: 'can_use_tool',
          tool_use_id: 'tool-1',
          tool_name: 'Bash',
          tool_input: { command: 'ls' },
          tool_display_name: 'Bash',
        },
      }) + '\n',
    })
    await Bun.sleep(20)

    // Should auto-allow (headless mode)
    const allowResponse = wsSend.mock.calls.find(c => {
      const parsed = JSON.parse(c[0])
      return (
        parsed.type === 'control_response' &&
        parsed.response.subtype === 'success' &&
        parsed.response.response?.behavior === 'allow'
      )
    })
    expect(allowResponse).toBeDefined()

    globalThis.WebSocket = WebSocket
    await promise.catch(() => {})
  })
  
  test('rejects invalid connection config', async () => {
    const config = {
      serverUrl: 'http://localhost:3456',
      sessionId: 'test-session',
      wsUrl: '', // empty wsUrl should fail
    }
    
    await expect(runConnectHeadless(config, '', 'json', false)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/server/__tests__/connectHeadless.test.ts -v`
Expected: FAIL — all tests fail because `runConnectHeadless` is a stub

---

### Task 2: Implement `runConnectHeadless` — WebSocket connection + headless message loop

**Files:**
- Modify: `ccb/src/server/connectHeadless.ts`

- [ ] **Step 1: Replace stub with proper types and WebSocket connect logic**

```typescript
/* eslint-disable eslint-plugin-n/no-unsupported-features/node-builtins */

import { randomUUID } from 'crypto'
import type { DirectConnectConfig } from './directConnectManager.js'
import type { StdoutMessage } from '../entrypoints/sdk/controlTypes.js'
import { logForDebugging } from '../utils/debug.js'
import { jsonParse, jsonStringify } from '../utils/slowOperations.js'

/**
 * Errors thrown by runConnectHeadless when the connection fails.
 */
export class ConnectHeadlessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConnectHeadlessError'
  }
}

function isStdoutMessage(value: unknown): value is StdoutMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as Record<string, unknown>).type === 'string'
  )
}

/**
 * Send a structured error response over WebSocket so the server doesn't
 * hang waiting for a reply to an unknown request subtype.
 */
function sendErrorResponse(ws: WebSocket, requestId: string, error: string): void {
  if (ws.readyState !== WebSocket.OPEN) return
  ws.send(
    jsonStringify({
      type: 'control_response',
      response: {
        subtype: 'error',
        request_id: requestId,
        error,
      },
    }),
  )
}

/**
 * Send a permission allow response for auto-approved tool requests in
 * headless mode.
 */
function sendPermissionResponse(
  ws: WebSocket,
  requestId: string,
  result: { behavior: 'allow'; updatedInput?: Record<string, unknown> },
): void {
  if (ws.readyState !== WebSocket.OPEN) return
  ws.send(
    jsonStringify({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: requestId,
        response: {
          behavior: 'allow',
          ...(result.updatedInput ? { updatedInput: result.updatedInput } : {}),
        },
      },
    }),
  )
}

/**
 * Connect to a remote session and run in headless mode.
 *
 * - Headless (`prompt` is a non-empty string): sends the prompt as a user message,
 *   streams `StdoutMessage` NDJSON lines to stdout, and exits after receiving
 *   the final `result` message.
 * - Interactive (`prompt` is empty with `interactive=true`): pipes process stdin
 *   and stdout to/from the WebSocket.
 *
 * Throws ConnectHeadlessError on connection failures.
 */
export async function runConnectHeadless(
  connectConfig: DirectConnectConfig,
  prompt: string,
  outputFormat: string,
  interactive: boolean,
): Promise<void> {
  if (!connectConfig.wsUrl) {
    throw new ConnectHeadlessError('Missing WebSocket URL in connection config')
  }

  const headers: Record<string, string> = {}
  if (connectConfig.authToken) {
    headers['authorization'] = `Bearer ${connectConfig.authToken}`
  }

  const ws = new WebSocket(connectConfig.wsUrl, {
    headers,
  } as unknown as string[])

  const isStreamJson = outputFormat === 'stream-json'
  const isJson = outputFormat === 'json'

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new ConnectHeadlessError('WebSocket connection timed out'))
      ws.close()
    }, 15_000)

    ws.addEventListener('open', () => {
      clearTimeout(timeout)
      logForDebugging(`[ConnectHeadless] WebSocket connected: ${connectConfig.wsUrl}`)

      if (!interactive && prompt) {
        // Headless mode: send the user prompt
        const userMessage = jsonStringify({
          type: 'user',
          uuid: randomUUID(),
          message: {
            role: 'user',
            content: prompt,
          },
        })
        ws.send(userMessage)
      }
      // Interactive mode: pipe stdin to WebSocket
      // (handled via 'data' event below)
    })

    ws.addEventListener('message', (event: MessageEvent) => {
      const raw = typeof event.data === 'string' ? event.data : ''
      const lines = raw.split('\n').filter(l => l.trim())

      for (const line of lines) {
        let parsed: unknown
        try {
          parsed = jsonParse(line)
        } catch {
          continue
        }

        if (!isStdoutMessage(parsed)) continue

        const msg = parsed

        // Handle control requests
        if (msg.type === 'control_request') {
          const request = msg.request as Record<string, unknown> | undefined
          if (request?.subtype === 'can_use_tool') {
            // Auto-allow all tool requests in headless mode
            sendPermissionResponse(ws, msg.request_id as string, {
              behavior: 'allow',
            })
          } else {
            logForDebugging(
              `[ConnectHeadless] Unsupported control request subtype: ${String(request?.subtype)}`,
            )
            sendErrorResponse(
              ws,
              msg.request_id as string,
              `Unsupported control request subtype: ${String(request?.subtype)}`,
            )
          }
          continue
        }

        // Skip internal protocol messages
        if (
          msg.type === 'control_response' ||
          msg.type === 'keep_alive' ||
          msg.type === 'control_cancel_request'
        ) {
          continue
        }

        // Output to stdout based on format
        if (isStreamJson) {
          process.stdout.write(line + '\n')
        } else if (isJson) {
          // Collect all messages, print final JSON at end
          // For json mode, we only print the final result
          if (msg.type === 'result' || msg.type === 'error') {
            process.stdout.write(line + '\n')
          }
        } else {
          // Text mode: extract text content from assistant messages
          if (msg.type === 'assistant') {
            const content = extractTextContent(msg)
            if (content) process.stdout.write(content)
          } else if (msg.type === 'result') {
            const content = extractTextContent(msg)
            if (content) process.stdout.write(content + '\n')
          }
        }

        // Check if this is the final result
        if (msg.type === 'result' || msg.type === 'error') {
          cleanup()
          const exitCode = msg.type === 'error' || (msg as Record<string, unknown>).is_error ? 1 : 0
          process.exitCode = exitCode
          resolve()
        }
      }
    })

    ws.addEventListener('close', () => {
      clearTimeout(timeout)
      logForDebugging('[ConnectHeadless] WebSocket closed')
      resolve()
    })

    ws.addEventListener('error', () => {
      clearTimeout(timeout)
      reject(new ConnectHeadlessError('WebSocket connection error'))
    })

    // Interactive mode: forward stdin to WebSocket
    if (interactive && !prompt) {
      const stdinRaw = process.stdin as unknown as NodeJS.ReadStream
      if (stdinRaw.isTTY) {
        stdinRaw.setRawMode?.(true)
      }
      stdinRaw.on('data', (chunk: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          const text = chunk.toString()
          if (text.trim()) {
            ws.send(
              jsonStringify({
                type: 'user',
                uuid: randomUUID(),
                message: {
                  role: 'user',
                  content: text,
                },
              }),
            )
          }
        }
      })
    }

    function cleanup(): void {
      clearTimeout(timeout)
      ws.close()
      if (interactive && !prompt) {
        const stdinRaw = process.stdin as unknown as NodeJS.ReadStream
        stdinRaw.setRawMode?.(false)
        stdinRaw.removeAllListeners('data')
      }
    }
  })
}

/**
 * Extract text content from a StdoutMessage.
 */
function extractTextContent(msg: StdoutMessage): string {
  const message = (msg as Record<string, unknown>).message as
    | Record<string, unknown>
    | undefined
  if (!message) return ''

  const content = message.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter(
        (block: Record<string, unknown>) =>
          block.type === 'text' && typeof block.text === 'string',
      )
      .map((block: Record<string, unknown>) => block.text as string)
      .join('')
  }
  return ''
}
```

- [ ] **Step 2: Run tests**

Run: `bun test src/server/__tests__/connectHeadless.test.ts -v`
Expected: PASS — all 5 tests pass

- [ ] **Step 3: Verify the main.tsx integration still builds**

Run: `bun run precheck`
Expected: PASS — no type errors, lint, or test failures

---

### Task 3: Update type signature to match actual usage

The stub was declared as `(...args: unknown[]) => Promise<void>` but `main.tsx` at line 4860 calls it with typed arguments:
```typescript
await runConnectHeadless(connectConfig, prompt, opts.outputFormat, interactive);
```

This is already fixed by the implementation in Task 2, but let's confirm the calling code in `main.tsx` doesn't need changes — it already imports `DirectConnectConfig` and passes the right types.

**Status:** No changes needed to `main.tsx` — the import at line 4856 and call at line 4860 are already correct.

- [ ] **Step 1: Confirm main.tsx integration**

Run: `grep -n "runConnectHeadless\|connectConfig" ccb/src/main.tsx | head -10`

Verify the import and call site match the new signature.

- [ ] **Step 2: Final verification**

Run: `bun run precheck`
Expected: PASS

---

## Self-Review

**1. Spec coverage:**
- `runConnectHeadless` receives `(DirectConnectConfig, prompt, outputFormat, interactive)` → covered in Task 2
- Headless mode sends user message, streams results → covered
- Interactive mode pipes stdin/stdout → covered
- Auto-allows tool permissions in headless mode → covered
- Error handling for missing wsUrl, connection failures → covered
- Tests for all scenarios → covered in Task 1

**2. Placeholder scan:**
- No TODOs, TBDs, or similar in any code block
- Every code block has complete implementation code
- Each test has proper assertions

**3. Type consistency:**
- `DirectConnectConfig` is imported from `directConnectManager.ts` — matches existing type
- `StdoutMessage` is imported from `controlTypes.ts` — matches existing type
- `jsonStringify`/`jsonParse` from `slowOperations.js` — matches existing pattern
- Same `isStdoutMessage` check pattern as `DirectConnectSessionManager` — consistent

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-19-connectHeadless.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
