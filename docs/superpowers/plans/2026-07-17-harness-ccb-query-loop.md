# Harness CCB Query Loop Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Replace DIY OpenAI loop in `ccb-runner` with CCB `ask()` / QueryEngine so Slot stays loop-free.

**Architecture:** `stdioBridge` unchanged; `runCCBAgent` bootstraps tools/commands/agents and maps SDKMessages → SlotEvents via `mapSdkToSlot`.

**Tech Stack:** CCB QueryEngine, bun:test

## Global Constraints

- Slot / CcbSlot must not contain agent loop logic
- Do not call `runHeadless` (stdout pollution)
- Keep SlotEvent SSE shapes stable for Web

---

### Task 1: Spec + mapper

- [x] Design: `docs/superpowers/specs/2026-07-17-harness-ccb-query-loop-design.md`
- [x] `ccb/src/harness/mapSdkToSlot.ts` + tests

### Task 2: Rewrite runner

- [x] `ccb/src/harness/ccb-runner.ts` → `ask()` with commands + agents + onion permissions
- [x] Update slot stdio design note

### Task 3: Verify

- [x] `bun test src/harness/__tests__/`
- [ ] Manual: Chat weather turn uses WebSearch via real query loop
