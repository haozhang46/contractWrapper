# Skill Factory 挂载

Skill Factory 以 git submodule 形式挂载在 `harness-console/skill-factory/`，内含嵌套 submodule `skill-assets/`。宿主提供 **两条控制通道**，共享同一套 `skill-factory/mcp/src/tools.ts` 业务实现：

| 通道 | 用途 | 入口 |
|------|------|------|
| **Chat + MCP stdio** | Agent 半自动编排、对话式操作 | CCB / 外部 MCP 客户端 → `skill-factory` MCP Server |
| **面板 + HTTP** | 人工点选、看列表与报告、触发同一工具 | Web shell「Skill Factory」Tab → Control `/api/skill-factory/*` |

二者不维护第二套业务逻辑；Control HTTP 薄代理与 MCP 工具 args/result 同构。

## Clone 与 submodule 初始化

```bash
git clone --recurse-submodules <harness-console-url>
# 或已有 clone 后：
git submodule update --init --recursive
```

未 init 时，Control 的 `/api/skill-factory/*` 返回 **503**，面板会引导执行上述命令。

## 路径解析（`SKILL_FACTORY_ROOT`）

默认：`{workspaceRoot}/skill-factory`（Control 启动时解析的 monorepo 根目录）。

覆盖：

```bash
export SKILL_FACTORY_ROOT=/absolute/path/to/skill-factory
```

MCP Server 同样支持该 env（`process.env.SKILL_FACTORY_ROOT ?? process.cwd()`）。Control 还会校验 `{factoryRoot}/mcp/src/tools.ts` 存在；缺失则视为 submodule 未就绪。

资产根目录固定为 `{factoryRoot}/skill-assets/`（staging / published）。

## 启动 MCP（供 CCB / Agent 连接）

```bash
cd skill-factory && bun install && bun run mcp
```

### CCB MCP 配置示例（stdio）

在 CCB mcp 设置中增加：

```json
{
  "skill-factory": {
    "command": "bun",
    "args": ["run", "mcp/src/server.ts"],
    "cwd": "<absolute-path-to>/harness-console/skill-factory"
  }
}
```

控制面：Chat 经 Agent 调 `skill-factory` MCP tools（`skill.list`、`skill.generate`、`eval.run` 等）。

## 人工面板（Web shell + Control HTTP）

### 启动宿主

在 monorepo 根目录：

```bash
bun install
bun run dev
```

- Control：`http://localhost:3100`（代理 `/api/skill-factory/*`）
- Web shell：`http://localhost:5173`

Control 必须能解析到含 `skill-factory/` 的 workspace root（默认即 clone 根目录）。

### 打开面板

1. 浏览器打开 Web shell
2. 顶栏选择 **Skill Factory** Tab（来自 widget 注册表，非硬编码页面）
3. 面板三区对应 MCP 工具全集：**Skills**（list/get）、**Generate**（generate / cases / rubric）、**Eval**（run / report / diff / cluster / suggest）

面板 **不** 直连 stdio MCP；通过 Control 调用与 MCP 相同的 `tools.ts` API（in-process import）。

### Control HTTP 路由

前缀：`/api/skill-factory`。响应 envelope：`{ ok, data, error }`。

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

常见错误语义（与 MCP 对齐）：

| 场景 | HTTP |
|------|------|
| submodule 未 init / tools 不可用 | 503 |
| 冻结路径 | 403，`code: 'FROZEN_PATH'` |
| 非法 zone / 零用例 fail-closed | 400 |
| skill 不存在 | 404 |

写操作写审计日志（与 MCP 写工具同等要求）。**无** publish / 改金标 / 改 `_meta/common_rubric.json` 的 HTTP。

## Widget 注册表契约

同仓包 `@harness/widgets`（`packages/widgets/`）。Shell 只依赖 registry API；bootstrap 侧 effect 完成注册：

```ts
// apps/web/src/main.tsx
import '@harness/widgets/skill-factory'
```

```ts
export type WidgetDefinition = {
  id: string                 // stable, e.g. 'skill-factory'
  title: string              // nav label
  order?: number             // lower first; default 100
  mount: () => ReactElement  // shell renders on active tab
}
```

- `registerWidget`：同 `id` 重复注册 → **覆盖并 console.warn**（便于 HMR）
- `listWidgets()`：按 `order` 升序，同 order 按 `id` 稳定排序
- 顶栏 Tab：固定 Chat / Settings + `listWidgets()` 动态 Tab

Skill Factory 为第一个注册 widget（`id: 'skill-factory'`），实现于 `packages/widgets/skill-factory/`。

### 后续抽 submodule 触发条件（本轮不做）

同时满足再考虑将 `packages/widgets` 独立成仓：

1. 第二个宿主仓库需要复用同一套 widgets，或
2. CCB 稳定批量写入 widget 且希望与 harness 发版解耦

在此之前保持 monorepo 内 `packages/widgets`。

## 相关设计文档

- MCP 与资产约定：[2026-07-18-skill-factory-design.md](./superpowers/specs/2026-07-18-skill-factory-design.md)
- Widget 面板与 HTTP 代理：[2026-07-18-skill-factory-widget-panel-design.md](./superpowers/specs/2026-07-18-skill-factory-widget-panel-design.md)
