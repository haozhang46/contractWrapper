# DeepTutor × Harness Console 集成

**日期：** 2026-07-20  
**状态：** Draft（待用户确认书面 spec）  
**宿主：** `harness-console`  
**外部系统：** [HKUDS/DeepTutor](https://github.com/HKUDS/DeepTutor)（Lifelong Personalized Tutoring）  
**范围：** Chat 极简 MCP 控制面（`status` + `run`）+ Widgets iframe 看板 Tab  
**非范围：** DeepTutor 进程/Docker 托管；kb/session/memory/partner/skill MCP；WebSocket 适配；微前端；修改 DeepTutor 源码；与 headless pages / skill-factory 数据打通；control 反代剥 X-Frame headers

## 背景与目标

DeepTutor 是独立的 agent-native 学习工作区（CLI + Web + SDK）。Harness Console 需要在不吞并其运行时的前提下：

1. 在 **Chat** 里让 CCB agent 调用 DeepTutor 能力（出题、解题、调研等）
2. 在 **Shell Tab** 里嵌（或外开）DeepTutor Web UI 作为看板

官方 DeepTutor **不提供**对外 MCP Server；它是 MCP **客户端**，对外入口是 CLI（`deeptutor run … --format json`）、WebSocket API、Python SDK。本设计采用与 skill-factory 相同的挂载选择：**控制走 MCP Chat；看板用独立 URL / iframe**。

## 架构结论（收口）

| 侧 | 职责 |
|----|------|
| **DeepTutor（外置）** | 用户自行安装与 `deeptutor start`；持有模型配置、KB、Memory、Web UI |
| **deeptutor-bridge（MCP）** | stdio MCP；仅包装本机 CLI；不二次推理 |
| **CCB Chat** | 经 `.mcp.json` 发现并调用 bridge 工具 |
| **Widgets Tab** | iframe / 外开看板；不调用 MCP |

```
apps/web  Tab「DeepTutor」──iframe──► http://127.0.0.1:3782（外开兜底）
    │
CCB Chat
    └── .mcp.json → deeptutor (stdio MCP bridge)
              └── spawn: deeptutor [run|…] --format json

DeepTutor（用户进程）
    ├── Web UI :3782
    └── CLI（MCP 唯一调用面）
```

**依赖假设**

- PATH（或 env 指定）上有 `deeptutor`（`pip install deeptutor` 或源码安装）
- Web 看板需用户另开 `deeptutor start`（或 Docker）；**MCP `run` 不依赖 Web 是否起来**
- Console **不**负责 DeepTutor 启停

## 仓内落地位置

| 路径 | 职责 |
|------|------|
| `libs/deeptutor-bridge/` | TypeScript stdio MCP（对齐 `harness-headless-connect` + `@modelcontextprotocol/sdk`） |
| `.mcp.json` | 注册 `deeptutor` server（command/args/env）；文档说明如何开关 |
| `packages/widgets/deeptutor/` | `DeepTutorPanel` + `registerWidget` |
| `apps/web` bootstrap | side-effect import 注册 widget（同 skill-factory） |
| `docs/` 短文 | 安装、端口、MCP、iframe/外开说明 |

## MCP 契约

**Server 名：** `deeptutor`

### Tool: `status`

探测 CLI 是否可用；可选探测 Web。

| 字段 | 类型 | 说明 |
|------|------|------|
| `check_web` | `boolean?` | 默认 `true`；对配置的 Web URL 做轻量 HTTP 探测 |

**返回（JSON 文本）：**

```json
{
  "cli_ok": true,
  "version": "1.5.2",
  "web_ok": false,
  "web_url": "http://127.0.0.1:3782",
  "error": null
}
```

- CLI 不在 PATH → `cli_ok: false`，`error` 含码 `CLI_NOT_FOUND`
- Web 探测失败不视为 MCP 工具失败；仅 `web_ok: false`

### Tool: `run`

跑一次 capability（底层：`deeptutor run <capability> "<message>" … --format json`）。

| 字段 | 类型 | 说明 |
|------|------|------|
| `capability` | enum | `chat` \| `deep_solve` \| `deep_question` \| `deep_research` \| `visualize` \| `math_animator` \| `mastery_path` |
| `message` | string | 必填 |
| `session` | string? | `--session` |
| `kb` | string \| string[]? | `--kb`（可重复） |
| `tool` | string[]? | `--tool`（可重复） |
| `language` | string? | `--language` |
| `config` | `Record<string, string \| number \| boolean>?` | 展开为重复 `--config key=value` |

**返回：** 聚合 NDJSON 后的最终文本回复；尽量解析并附带 `session_id`（若事件中有）。非零退出时返回 stdout/stderr 摘要 + exit code，错误码风格与 `status` 一致。

**运行约定**

- Bridge 只 `spawn` 本机 `deeptutor`；binary 路径可读 `DEEPTUTOR_BIN`（默认 `deeptutor`）
- Web URL（`status.web_url` 与探测目标）可读 `DEEPTUTOR_WEB_URL`，默认 `http://127.0.0.1:3782`（与 Widget 默认一致，但两边独立配置，不强制同步）
- 若设置 `DEEPTUTOR_HOME`，作为子进程 env 传入（DeepTutor 官方以该 env / start `--home` 定位 workspace）；v1 **不**对 `run` 额外拼 `--home` 旗标，避免与 CLI 子命令差异打架
- 默认超时 **120s**；`DEEPTUTOR_MCP_TIMEOUT_MS` 可覆盖；超时 kill 进程并返回 `TIMEOUT`
- 不做二次 LLM；不扩展 kb/session/memory/partner/skill 工具（v1）

## iframe Widget

- `registerWidget({ id: 'deeptutor', title: 'DeepTutor', order: 60 })`（排在 skill-factory `order: 50` 之后）
- 默认 URL：`http://127.0.0.1:3782`；面板内简单输入框写入 `localStorage` 键 `harness.deeptutor.webUrl` 可覆盖；v1 不做 Settings 大页
- 顶栏：「在新窗口打开」+「刷新」；主体 `<iframe>`
- 加载失败 / 疑似被 X-Frame / CSP 拒绝：明确提示 + 外开按钮
- **v1 不做** control 反代剥 header
- Widget **不**调用 MCP；与 Chat 控制面解耦

## 错误处理

| 情况 | 行为 |
|------|------|
| CLI 缺失 | `CLI_NOT_FOUND`，文案可读 |
| 非零退出 | 摘要 stdout/stderr + exit code |
| 超时 | `TIMEOUT`，进程已 kill |
| Web 未起 | `status.web_ok=false`；iframe 提示；不阻塞 Chat |
| iframe 被拒 | 引导外开，不静默空白 |
| `.mcp.json` 未注册 | Chat 无该工具（预期） |

## 测试与验收

**自动化（v1）**

- bridge：`status` 在假 CLI / 缺失 CLI 下的行为
- bridge：`run` 参数拼装（capability / message / kb / tool / session / config）
- widget：注册后 `listWidgets()` 含 `deeptutor`

**不做：** 对真实 DeepTutor 的 CI e2e。

**手工验收**

1. 未装 CLI：Chat 调 `status` → 清晰失败  
2. 已装 CLI：`run` + `capability=chat` + 短 message → 有回复  
3. Tab：可外开；若本机 3782 可嵌则 iframe 可见，否则提示不崩  
4. 移除 `.mcp.json` 条目后 Chat 不再暴露该工具  

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| DeepTutor 禁止 iframe | 外开兜底（已定） |
| `run` 耗时长 | 120s 超时 + 文档建议调大 / 用短任务 |
| PATH / 多 Python 环境 | `DEEPTUTOR_BIN` 绝对路径 + 文档 |
| NDJSON 形态变更 | 聚合逻辑宽松：优先抽最终 content / done；否则退回原始文本 |

## 后续（明确不做进 v1）

- `kb_*` / `session_*` / memory / partner / skill MCP 工具  
- WebSocket 流式桥  
- control 托管 Docker / `deeptutor start`  
- 同源反代嵌入  
- 与官方 `SKILL.md` 全文入库（可选文档链接即可）
