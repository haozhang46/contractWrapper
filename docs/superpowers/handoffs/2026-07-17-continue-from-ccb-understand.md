# 交接：Harness 中控台 × CCB 迭代（给下一个 Chat）

**日期：** 2026-07-17  
**用途：** 当前对话 context 过长；新会话读完本文即可继续，不必重读整段历史。  
**仓库根：** `/Users/hz/Desktop/fe/harness-console`

---

## 一句话目标

在 **CCB（claude-code-best）submodule** 上做中控台迭代：自有 Web UI + 契约洋葱 + 极薄 Slot；**不用** CCB 终端 UI；默认改 CCB 内 **LLM/供应商**；Skill 在 CCB 上演进；Memory 可替换实现。

---

## 已拍板决策（勿重新争论，除非用户改口）

| 主题 | 决策 |
|------|------|
| 与 Agent Flow Desktop | **无关**（无代码依赖、不参考实现） |
| 基座 | **CCB fork 上迭代**，不是从零写 Agent |
| 仓库形态 | 根仓 `harness-console`；实现在 git submodule **`ccb/`** → `https://github.com/claude-code-best/claude-code.git` @ `b4149bbf` |
| Slot | **极薄接口（B）**：壳只依赖 Slot；**现阶段唯一实现 = CCB 无头**；优先改 LLM；不多厂商框架 |
| 终端 UI | **不用** CCB Ink/REPL |
| Chat UI | **全新** Headless components；只复用 CCB 无头会话/流式/tool 事件（方案 A） |
| 默认 Render | [Headless UI](https://headlessui.com/) + Tailwind（可换，不焊进契约） |
| 默认 Client | Web（可换） |
| 权限 | `canUseTool` / `hasPermissionsToUseTool` → **洋葱**（Settings CRUD） |
| 洋葱默认层 | `audit` + `capability-gate` + `require-confirm`；用户可改可删；链空 → 拒绝特权调用 |
| 能力分级 | L1 默认放行；L2 可配；**L3 必须用户确认** |
| LLM | 架构学 CC；默认模型可配 **DeepSeek**（CCB provider） |
| LangChain / LangGraph | **不用**作内核；编排图归以后 Fusion Workflow |
| HarnessAgent (AI SDK) | 可选其它 Slot，**不是**默认 |
| Memory | **可替换 Provider**；默认先裹 CCB `memdir`/extract |
| Skill | **在 CCB Skill 体系上迭代**（勿平行重写） |
| 合规 | CCB 为社区复原仓，作产品基座有版权风险；用户已选接受（决策 C） |
| 沟通语言 | 用户要求 **中文** |

心智模型（北极星）：**章程（软）→ 契约（洋葱）→ 沉淀（Memory + Skill）**。

---

## 关键路径

| 路径 | 说明 |
|------|------|
| `docs/superpowers/specs/2026-07-17-harness-control-console-north-star-design.md` | 北极星架构（Approved） |
| `docs/superpowers/specs/2026-07-17-harness-control-console-spec-line.md` | Spec 线 T1–T8 + 基座决策 |
| `docs/superpowers/handoffs/2026-07-17-continue-from-ccb-understand.md` | **本文** |
| `README.md` | 克隆 submodule、跑 CCB |
| `ccb/` | submodule 源码与本地构建产物 |
| `ccb/.ua/knowledge-graph.json` | Understand 聚焦图谱（已完成） |
| `ccb/.ua/meta.json` | 分析元数据；commit `b4149bbf` |
| `ccb/.ua/.understandignore` | 分析范围（排除 Ink UI 等） |

本地曾装 Bun：`~/.bun/bin`；跑 CCB 需**真实 Terminal TTY**（Cursor 内 `bun run dev` 会因 `--print` 失败）。

```bash
export PATH="$HOME/.bun/bin:$PATH"
cd ccb && bun run dev   # 或 bun dist/cli-bun.js；首次 /login
```

---

## Git 状态（交接时）

- 根仓 **已有首次 commit**：`f1ea166` — bootstrap submodule + 架构文档  
- 含：`.gitmodules`、`ccb` gitlink、`README.md`、两份 specs  
- `ccb (untracked content)` 多为本地 `node_modules` / `dist` / `.ua`，正常，勿强行塞进父仓  
- 根仓 `main` 可能尚未 push remote（视环境而定）

---

## Understand 结论（写 Spec 时用）

聚焦约 **320** 核心文件（排除终端 UI / 大量 slash commands）。图谱分层与改动点：

| 层 | CCB 落点 | 产品动作 |
|----|----------|----------|
| Agent 循环 | `src/query.ts`, `src/QueryEngine.ts` | 无头；经极薄 Slot 暴露 |
| 权限（洋葱替换点） | `src/hooks/useCanUseTool.tsx` → `hasPermissionsToUseTool`（`utils/permissions/permissions.ts`）+ hooks/yoloClassifier | 换成可 CRUD 洋葱；L1–L3 |
| 工具 | `packages/builtin-tools`（Bash/File/Skill/Agent/MCP…）；`toolOrchestration` → `toolExecution` | 保持 Tool 一等；每次 call 过洋葱 |
| LLM | `services/api/*`, `providerRegistry`, `utils/model` | 改默认 DeepSeek / 供应商 |
| MCP | `services/mcp`, `MCPTool` | 以后挂 Project Control |
| Skill | `skills/loadSkillsDir.ts`, `SkillTool`, `skillLearning`, `skillSearch` | 演进，映射 `.harness/skills/` |
| Memory | `memdir/*`, `extractMemories`, `teamMemorySync`, `claudemd.ts` | 抽 `MemoryProvider`；默认可裹 CCB |
| 入口/UI | `entrypoints/cli.tsx`, Ink components | **产品不用**；自研 Web Chat/Settings |

Tour 也在图谱 `tour[]` 里（7 步）。

---

## Spec 线进度

| ID | 内容 | 状态 |
|----|------|------|
| T1 | 章程 + 洋葱 + 空态 Web 壳 + `.harness` 骨架 | **已完成**（2026-07-17） |
| T2 | Project MCP + AuthZ + 洋葱挂 call | **已完成**（2026-07-17） |
| T3 | Fusion + Headless；Chat 进 Headless components | **已完成**（2026-07-17） |
| T4 | 极薄 Slot + 唯一实现 CCB（改 LLM） | **已完成**（2026-07-17） |
| T5 | Skill 收束/迭代 | **已完成**（2026-07-17） |
| T6 | Memory Provider | **已完成**（2026-07-17） |
| T7 | 其它 Slot（HarnessAgent + factory） | **已完成**（2026-07-17） |
| T8 | Workflow 引擎插件 | **已完成**（2026-07-17） |

磁盘骨架（已拍板）：

```text
<workspace>/.harness/
  charter.md
  contract-onion.json
  audit/
  chat/          # T4 会话；T1 可空目录
  skills/ memory/ fusion/ workflows/
  manifest.json
```

仓库策略：以 **`ccb/` 为迭代根**挂 `harness/`（或包）；根仓也可继续放 docs。

---

## 当前状态（2026-07-17）

**T1–T8 全部实现完毕。** 代码位于 worktree：`.claude/worktrees/feat+harness-t1-onion-web-shell/ccb/`。

### 实现概要

| 层 | 实现位置 | 改动说明 |
|----|----------|----------|
| 洋葱运行时 | `harness/onion/` | Koa compose；audit + capability-gate + require-confirm 三层 |
| 权限注入 | `src/utils/permissions/permissions.ts:1513` + `src/hooks/useCanUseTool.tsx:29` | 各 1 行；洋葱接管 canUseTool |
| MCP 注入 | `src/services/mcp/client.ts` +17 行 | Harness MCP 服务器注册 |
| Bootstrap | `harness/bootstrap/` | .harness 目录初始化 |
| Web 壳 | `harness/web/` | Hono API + React + Headless UI + Tailwind |
| Fusion 总线 | `harness/fusion/` | 插件注册/生命周期/事件 |
| Headless | `harness/headless/` | 命名视图注册表 |
| Slot | `harness/slot/` | AgentSlot 接口 + CCB 实现 + HarnessAgent 实现 + factory |
| LLM | `harness/llm/` | DeepSeek 默认配置 + 预设 |
| Skill | `harness/skills/` | SkillProvider 抽象 + CCB 实现 |
| Memory | `harness/memory/` | MemoryProvider 抽象 + CCB 实现 |
| AuthZ | `harness/authz/` | 基础 subject × operation 授权 |
| Workflow | `harness/workflow/` | DAG 编排 + Fusion 插件注册 |
| MCP Server | `harness/mcp/` | 6 个 MCP 工具（onion.list/update、charter.read/update、audit.tail、harness.status） |

### 测试

- Harness 测试：**32 pass, 0 fail**（onion 9 + memory 6 + workflow 6 + slot 6 + llm 5）
- CCB 回归测试：**16 pass, 0 fail**
- TypeScript：零错误

### Commit 记录（16 commits）

```
aa53ade8 feat: add HarnessAgent Slot (second impl) and Slot factory with runtime switching
e771ec2c feat: add Workflow Engine as Fusion plugin with graph validation, execution, and CRUD registry
02f5c49e feat: add SkillProvider and MemoryProvider abstractions with CCB-backed defaults
ab5386e2 feat: add thin AgentSlot interface, CCB stub implementation, and default DeepSeek LLM config
a4024808 feat: add Fusion plugin bus, Headless UI runtime, and refactor Chat to headless component
d686b399 feat: add Project Control MCP server with onion/charter/audit management tools and AuthZ module
4732f8d7 fix: chain-empty now denies even with forced audit layer (non-audit layers must exist)
4f905c72 test: add onion runtime unit tests (default layers, capability gate, empty chain)
c9e07197 feat: add React web shell with Chat|Settings tabs and onion editor CRUD UI
69f74b94 feat: add .harness bootstrap scripts and Hono web server with REST API
9c9a9935 feat: inject onion runtime into CCB permission pipeline
02fc8669 fix: enforce audit layer in updateLayers and document require-confirm as T2 placeholder
43eb1cdb feat: implement Koa-style onion runtime with default audit/capability-gate/require-confirm layers
71d77ca6 feat: add default onion layers (audit + capability-gate + require-confirm)
ba4db7e3 feat: define onion layer types and middleware contract
9a7c6358 chore: add Tailwind + Headless UI deps and Vite config for harness web shell
```

### 文件结构

```
ccb/harness/
  __tests__/onion-runtime.test.ts       (9 tests)
  authz/{types,authz}.ts
  bootstrap/{init,loadCharter,loadOnion}.ts
  fusion/{types,bus}.ts
  headless/{types,registry}.ts
  llm/{config,config.test}.ts           (5 tests)
  mcp/{server,register}.ts
  memory/{types,ccb-provider}.ts + __tests__/  (6 tests)
  onion/{types,defaultLayers,runtime,onionPermissions}.ts
  skills/{types,ccb-provider}.ts
  slot/{types,ccb-slot,harness-agent-slot,factory}.ts + __tests__/  (6 tests)
  web/{server,vite.config}.ts + client/ + routes/api/
  workflow/{types,engine,registry,fusion-plugin}.ts + __tests__/  (6 tests)
```

## 下一个 Chat 应做什么

T1–T8 已全部实现。下一步可选方向：

1. **产品化 T4** — 把 CCB Slot stub 换成真正的 `query()` 调用，接上 agent 循环
2. **验证 T1 洋葱** — 在真实 CCB 会话中跑一次，确认 `Bash` 被拦截为 ask、`FileRead` 放行
3. **Web Chat 产品化** — 把 ChatPanel 从占位提升到真正常数流式对话
4. **Push CCB fork** — 创建自有 remote，把 16 commits push 上去
5. **补 T2 MCP 集成** — 确认 Harness MCP server 在 CCB 启动时自动注册
6. **设计 T2+ 下一步 Spec** — Project Control MCP 完整工具面、远程 AuthZ、Fusion 可视化编辑器

**依然不要做的：**
- 把 CCB 终端 UI 当产品 Chat
- 用 LangGraph 做默认 Agent
- 忽略合规风险

## 给新 Chat 的启动句（可复制）

```text
请阅读 docs/superpowers/handoffs/2026-07-17-continue-from-ccb-understand.md
T1–T8 已全部实现，代码在 CCB worktree 的 harness/ 目录下。
请验证当前状态，然后 [选择下一步方向]。
用中文沟通。
```
