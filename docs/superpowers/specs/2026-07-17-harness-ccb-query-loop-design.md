# Harness Chat：CCB `ask()` / QueryEngine 作为唯一 agent loop

**日期：** 2026-07-17  
**状态：** Approved（对话确认「全做」）  
**上游：** [Agent Slot + CCB stdio](./2026-07-17-harness-agent-slot-stdio-design.md)

## 目标

Slot / CcbSlot / stdioBridge **不包含** agent loop。唯一 loop 为 CCB 的 `ask()` → `QueryEngine` → `query()`（与 ACP / `-p` 同路径）。

## 边界

| 层 | 职责 |
|----|------|
| `packages/slot` / `CcbSlot` | turn 进、SlotEvent 出 |
| `stdioBridge` | JSONL 协议（不变） |
| `ccb-runner.runCCBAgent` | bootstrap + 调 `ask()` + SDKMessage→SlotEvent |
| CCB `QueryEngine` / `query.ts` | schema、工具循环、校验重试、commands、agents |

## 实现要点

1. 删除 DIY OpenAI `fetch` + `tool.call` 循环与手写 `zSchema`
2. bootstrap 对齐 ACP `createSession`：`enableConfigs`、`getTools`、`getCommands`、`getAgentDefinitionsWithOverrides`、`hasPermissionsToUseTool`（洋葱）
3. `includePartialMessages: true` 以产出 `text-delta`
4. history：`messages.slice(0,-1)` → `mutableMessages`；最后一条 user → `prompt`
5. LLM：保留从 `.harness/llm.json` 写 OpenAI env

## 非目标

- 改 Slot 接口或 Web SSE 形状
- 调用 `runHeadless`（污染 stdout）
