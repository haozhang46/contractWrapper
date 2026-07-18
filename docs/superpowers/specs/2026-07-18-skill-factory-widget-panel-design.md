# Skill Factory Widget Panel — 可沉淀 Widget 注册表 + 人工控制面

**日期：** 2026-07-18  
**状态：** Draft（待用户审阅 spec 后 Approved）  
**宿主：** `harness-console`（`apps/web`、`apps/control`、`packages/widgets`）  
**依赖：** [2026-07-18-skill-factory-design.md](./2026-07-18-skill-factory-design.md)（MCP 契约与资产约定）；`skill-factory` submodule  
**范围：** 同仓 widget 注册表、顶栏动态 Tab、Skill Factory 面板（对齐现有 MCP 工具全集）、Control HTTP 薄代理  
**非范围：** widget 独立 submodule、微前端、iframe 独立产品、`skill.publish`、真 Claude 生成正文、CCB 自动产 UI 流水线（仅预留契约）

## 背景与目标

Skill Factory 已通过 MCP 暴露半自动工具；Chat 可调。但缺少 **人可直接点的控制面**，且后续希望 CCB 按用户需要生成 UI，需要可沉淀的 **widget + 注册表**，而不是一次性写死页面。

**目标：**

- Chat 继续走 MCP；同时提供 Skill Factory **人工面板**（顶栏 Tab）
- 面板操作覆盖现有 MCP 工具全集（范围 C）
- 引入同仓 **widget 注册表**；Skill Factory 为第一个注册 widget
- 契约可演进：第二宿主或 CCB 批量产 widget 时再抽 submodule（本轮不抽）

## 架构结论

采用 **方案 1：薄注册表 + 手写第一块 Skill Factory widget**。

```
apps/web          → shell：固定 Tab（Chat / Settings）+ listWidgets() 动态 Tab
packages/widgets  → WidgetDefinition、registry、skill-factory 面板实现
apps/control      → /api/skill-factory/* 薄 HTTP，语义对齐 MCP，复用 skill-factory tools
skill-factory     → 既有 tools.ts / 冻结路径 / 审计（唯一业务实现面）
```

面板 **不** 直连 stdio MCP。Control 调用与 MCP 相同的 `tools.ts` API（in-process import 优先；若打包边界困难再退子进程），保证 Chat 与面板行为一致。

## Widget 注册表

### 目录

```
packages/widgets/
  package.json
  src/
    types.ts
    registry.ts          # registerWidget / getWidget / listWidgets
    index.ts
  skill-factory/
    SkillFactoryPanel.tsx
    index.ts             # side-effect: registerWidget({ id: 'skill-factory', ... })
```

### 契约

```ts
export type WidgetDefinition = {
  id: string                 // stable, e.g. 'skill-factory'
  title: string              // nav label
  order?: number             // lower first; default 100
  mount: () => ReactElement  // or React.lazy-compatible factory
}
```

- `registerWidget`：同 `id` 重复注册 → **覆盖并 console.warn**（便于 HMR / 生成替换）
- `listWidgets()`：按 `order` 升序、同 order 按 `id` 稳定排序
- Shell **只依赖** `packages/widgets` 的 registry API，不硬编码 Skill Factory 组件 import 路径以外的业务细节（bootstrap 可 `import '@harness/widgets/skill-factory'` 完成注册）

### Shell 集成

`apps/web` 顶栏：

| Tab | 来源 |
|-----|------|
| Chat | 固定 |
| Settings | 固定 |
| Skill Factory 等 | `listWidgets()` |

选中动态 Tab 时渲染 `widget.mount()`。

### 后续抽 submodule 触发条件（本轮不做）

同时满足再考虑独立仓：

1. 第二个宿主仓库需要复用同一套 widgets，或  
2. CCB 稳定批量写入 widget 且希望与 harness 发版解耦  

在此之前保持 `packages/widgets`。

## Control HTTP（对齐 MCP）

前缀：`/api/skill-factory`

| 方法 | 路径 | MCP 工具 |
|------|------|----------|
| GET | `/skills` | `skill.list` |
| GET | `/skills/:id?zone=` | `skill.get` |
| POST | `/skills/generate` | `skill.generate` |
| POST | `/cases/generate` | `eval.cases.generate` |
| POST | `/rubric/generate` | `rubric.generate` |
| POST | `/eval/run` | `eval.run` |
| GET | `/eval/report?path=` | `eval.report.get` |
| POST | `/eval/diff` | `eval.diff` |
| POST | `/eval/cluster` | `eval.low_score.cluster` |
| POST | `/optimize/suggest` | `skill.optimize.suggest` |

### 约束

- 请求/响应字段与 MCP tool args/result **同构**（可多包一层 `{ ok, data, error }`）
- 冻结路径拒绝 → HTTP **403**，body 含 `code: 'FROZEN_PATH'`
- 非法 zone / 零用例 fail-closed → **400**（与 skill-factory 现有 Error 语义对齐）
- 报告 path 必须经既有 `assertReportPath` 约束
- 写操作写审计日志（与 MCP 写工具同等要求）
- **无** publish / 改金标 / 改 `_meta/common_rubric.json` 的 HTTP

### 进程与路径

- Control 需能解析 `skill-factory` 与 `skill-assets` 根目录（env 或相对 monorepo / submodule 路径）
- 若 submodule 未 init：相关 API 返回 **503** + 明确文案，面板展示引导（`git submodule update --init --recursive`）

## Skill Factory 面板 IA

单页三区（不做独立路由）：

1. **Skills** — list；选中 get；zone：`staging` | `published`
2. **Generate** — `skill.generate`（id + description）；`cases.generate`；`rubric.generate`
3. **Eval** — `eval.run`；展示 report 路径与摘要；`diff` / `cluster` / `suggest`

UI 风格跟随现有 Settings / shell（Tailwind + 现有 class），不做新视觉体系。

错误：展示后端 `message` / `code`；不吞掉 `FROZEN_PATH`。

## 与 Chat / MCP 的关系

| 通道 | 用途 |
|------|------|
| Chat + MCP stdio | Agent 半自动编排、对话式操作 |
| 面板 + HTTP | 人工点选、看列表与报告、触发同一工具 |

二者共享 skill-factory 实现；不维护第二套业务逻辑。

## CCB 产 UI 预留（本轮不实现）

约定即可：

1. 新 widget 遵守 `WidgetDefinition`
2. 在约定入口文件调用 `registerWidget`
3. 禁止生成绕过 Control、直写 `published/` 或冻结路径的前端逻辑

完整 codegen 流水线不在本 design 范围。

## 错误处理

| 场景 | 行为 |
|------|------|
| submodule 缺失 | 503 + 面板引导 |
| FROZEN_PATH | 403 + code |
| 非法 zone / 零 case | 400 |
| skill 不存在 | 404 |
| 报告 path 穿越 | 400（与 assertReportPath 一致） |

## 测试策略

- **registry：** 注册、覆盖、排序
- **HTTP：** 每个路由至少 happy path；FROZEN_PATH → 403；未 init submodule → 503
- **面板：** 关键组件测关键调用（mock fetch）；不强制 E2E
- **不测：** CCB 生成 UI；publish；微前端加载

## 成功标准

1. 顶栏出现 Skill Factory Tab（来自 registry，非硬编码业务组件树）
2. 面板可完成与现有 MCP 工具全集对等的人工操作（无 publish）
3. Chat MCP 与面板 HTTP 命中同一套 skill-factory 工具实现
4. 文档写明 widget 契约与日后抽 submodule 触发条件

## 实现顺序建议（供 writing-plans）

1. `packages/widgets`：types + registry + 单测  
2. Control：`/api/skill-factory/*` 代理 + 单测  
3. `SkillFactoryPanel` 三区 UI + fetch  
4. `App.tsx` 动态 Tab 挂载 + 注册 bootstrap  
5. 文档：更新 skill-factory 挂载说明（面板 + MCP）  

---

## 附录：能力对照

| 能力 | 落点 |
|------|------|
| Widget 注册表 | `packages/widgets` |
| Skill Factory 人工面 | `packages/widgets/skill-factory` + 顶栏 Tab |
| 工具实现 / 冻结 / 审计 | `skill-factory`（既有） |
| HTTP 薄代理 | `apps/control` |
| Chat MCP | 既有 CCB + skill-factory MCP |
| widget submodule | **非本轮**（触发条件见上） |
| CCB 自动产 UI | **非本轮**（仅契约预留） |
