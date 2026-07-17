# Harness Chat：CCB `ask()` / QueryEngine 作为唯一 agent loop

**日期：** 2026-07-17  
**状态：** Absorbed — 正文已并入 [Agent Slot + CCB stdio](./2026-07-17-harness-agent-slot-stdio-design.md)「Agent loop（唯一）」与职责分层  
**上游：** 同上

## 摘要（保留便于检索）

| 层 | 职责 |
|----|------|
| Slot / CcbSlot / stdioBridge | 无 loop |
| `ccb-runner` | bootstrap + `ask()` + `mapSdkToSlot` |
| QueryEngine / `query.ts` | 唯一 loop（schema、重试、commands、agents、**subagent**） |

- 不调用 `runHeadless`
- 外层不转发 `parent_tool_use_id`
- 实现：`ccb/src/harness/ccb-runner.ts`、`mapSdkToSlot.ts`
