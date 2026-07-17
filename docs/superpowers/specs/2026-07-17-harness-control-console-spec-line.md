# Harness 中控台 — Spec 线

**日期：** 2026-07-17  
**状态：** Living（对照本仓实现维护；T4 已落地）  
**上游：** [北极星架构](./2026-07-17-harness-control-console-north-star-design.md)  
**用途：** 子 Spec 序列；每条线走 **Spec → 实现计划 → 实现**。

## 基座决策（2026-07-17）

**在 [CCB](https://github.com/claude-code-best/claude-code)（claude-code-best）fork 上迭代**，而不是另起无关 Agent 内核。

| 项 | 选择 |
|----|------|
| 代码基座 | CCB fork，位于本仓 **`ccb/`**（自 `claude-code-best/claude-code` 拉取） |
| 语族 | TypeScript / Bun |
| Slot | **极薄接口（决策 B）**：壳只依赖 Slot；**现阶段唯一实现 = CCB 无头**；主要改动在 CCB 内 LLM/供应商；多绑定以后再说 |
| 终端 UI | **不用** CCB Ink/REPL |
| Chat UI | **全新** Headless components；只复用 CCB 无头会话/流式/tool 事件（方案 A） |
| 权限 | `canUseTool` → **洋葱**（Settings CRUD；L1–L3；L3 必确认） |
| 默认 Render | [Headless UI](https://headlessui.com/) + Tailwind（可换） |
| 默认 Client | Web（可换） |
| 默认模型 | 可配 DeepSeek（CCB 自定义供应商） |
| LangChain/LangGraph | 不用作内核 |
| 合规 | 社区复原仓作基座有版权风险；用户选择接受（决策 C） |

```text
你们的 Web 壳（Chat|Settings · Client/Render Adapter）
        ↓ 极薄 Slot 接口（仅此契约；现阶段不搞多适配器框架）
CCB 无头（唯一实现）—— fork 上改；优先改 LLM/供应商
        ↓ 每次 tool
洋葱（原 canUseTool）
        ↓
执行 + .harness 落盘
```

**仓库策略（贴 CCB）：** 本仓根目录为 `harness-console`；实现基座为 git submodule **`ccb/`** → `https://github.com/claude-code-best/claude-code.git`。迭代时在 submodule 内改（建议自有 fork remote）；中控能力以 `harness/` 或 `ccb` 内包挂入。Understand 目标：`ccb/`。

## 原则

- 一条 Spec 一个可验收切片。
- 依赖只向前。
- 上层永远是契约；适配器可换。
- 非目标继承北极星，除非子 Spec 显式扩入。

## Spec 线总览

```text
T1 章程+洋葱+空态Web壳（挂在 CCB 旁/上；尚可不驱满血 loop）
 └─ T2 Project Control MCP + AuthZ + 洋葱挂每次 tool call
      ├─ T3 Fusion + Headless + Render（Chat widgets 正式进 Headless）
      ├─ T4 极薄 Slot + 唯一实现 CCB（优先改 LLM）
      │     ├─ T5 Skill + Subagent（收束 CCB 子代理）
      │     └─ T6 Memory
      └─ T7 其它 Slot 实现（以后）
           └─ T8 Workflow 插件
```

| ID | 焦点 | 依赖 | 状态 |
|----|------|------|------|
| **T1** | 章程 + 洋葱 + Web 空态壳 + `.harness` 骨架 | — | 已落地（进程分离后在本仓 `apps/*` + `packages/onion`） |
| **T2** | Project MCP + AuthZ + 洋葱挂 call | T1 | 已落地（Control onion HTTP + CCB bridge） |
| **T3** | Fusion + Headless；Chat 等为 Headless components | T2 | 部分（Chat/Settings/Confirm 已在 Web） |
| **T4** | 极薄 Slot + 唯一实现 CCB（改 LLM）；不多厂商框架 | T1/T2 | **已落地** — 见 [Slot+stdio 现行 Spec](./2026-07-17-harness-agent-slot-stdio-design.md) |
| **T5** | Skill + Subagent | T2, T4 | Subagent **在 CCB 内**已可用；外层不编排（见 T4 Spec） |
| **T6** | Memory | T2, T4 | 部分（Settings + extract API） |
| **T7** | 其它 Slot 实现（以后） | T4, T5 | 待写 |
| **T8** | Workflow 等业务插件 | T3, T5 | 待写 |

---

## T1 — 章程 + 洋葱 + 空态 Web 壳

**目标：** 在 CCB 工程旁挂上中控最小面：Workspace `.harness/`、章程、洋葱 Settings CRUD、Web Header 仅 Chat|Settings；特权 stub 可测洋葱。

**已拍板：**

- 磁盘：完整 `.harness/` 骨架（`charter.md`、`contract-onion.json`、`audit/`、`chat/`、`skills/`、`memory/`、`fusion/`、`workflows/`、`manifest.json`）。
- 洋葱默认层：`audit` + `capability-gate` + `require-confirm`；用户 Settings 可改可删；链空 → 拒绝特权调用。
- 能力三级：L1 默认放行；L2 可配；**L3 必须确认**。
- Web + Headless UI + Tailwind 为默认 Client/Render；接口可换。
- Chat：占位或最小 Web；不接 CCB 终端 UI。

**范围外（T1 当时）：** 满血 CCB loop 产品化（→ **T4 已接 `ask()` / QueryEngine**）；完整 Headless JSON 运行时（T3）；远程 MCP。

---

## T2 — Project Control MCP + AuthZ

控制面；每次 tool 过洋葱。阶段 1 与 CCB Tool 注册表并存。

---

## T3 — Fusion + Headless + Render

Chat/确认卡等做成 Headless components；默认 Render = Headless UI + Tailwind。

---

## T4 — 极薄 Slot + CCB（唯一实现）

**现行 Spec：** [2026-07-17-harness-agent-slot-stdio-design.md](./2026-07-17-harness-agent-slot-stdio-design.md)（状态：Implemented）

- **Slot**：`packages/slot` 最小接口；壳不 import CCB 内部模块。
- **唯一实现**：`CcbSlot` → stdio → `stdioBridge` → `runCCBAgent` → **`ask()` / QueryEngine**（非 DIY OpenAI 环）。
- **Loop / Subagent / schema 重试**：仅在 CCB；外层不转发 `parent_tool_use_id`。
- `canUseTool` → 洋葱（HTTP）；会话持久化含顶层 `toolCalls`。
- 以后换引擎：再加第二个 Slot 实现，不推翻壳。

---

## T5–T8

见北极星拆分；在 CCB 已有子代理/Skill/记忆能力上 **收束到契约与 MCP**，而非平行再造一整套。

## 下一步

- T4 现行文档以 [Slot+stdio Spec](./2026-07-17-harness-agent-slot-stdio-design.md) 为准。
- 后续可推进 T5 外层契约（若需要 Skill 产品面）、T7 第二 Slot、或加固天气/搜索 E2E。
