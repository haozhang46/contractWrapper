# DeepTutor × Harness Console

Harness Console 通过 **Chat MCP** 调用本机 DeepTutor CLI，并在 Web shell 的 **DeepTutor** Tab 嵌入（或外开）DeepTutor Web UI。DeepTutor 本身是外置系统：Console **不**安装、不托管、不启停其进程。

上游项目：[HKUDS/DeepTutor](https://github.com/HKUDS/DeepTutor) · [deeptutor.info](https://deeptutor.info/)

设计 spec：[2026-07-20-deeptutor-console-integration-design.md](./superpowers/specs/2026-07-20-deeptutor-console-integration-design.md)

## 安装与启动 DeepTutor（用户侧）

在 Console 之外自行安装并运行 DeepTutor：

```bash
pip install -U deeptutor
deeptutor init
deeptutor start
```

默认 Web 前端端口为 **3782**（`http://127.0.0.1:3782`）。MCP 的 `run` 只依赖 CLI，**不要求** Web 已启动；Widget 看板则需要你另开 `deeptutor start`（或 Docker 等等价方式）。

## Chat：MCP bridge

实现位于 `libs/deeptutor-bridge/`（stdio MCP，对齐 `harness-headless-connect`）。

### 注册 `.mcp.json`

仓库根目录的 `.mcp.json` 已提交示例条目。`args` 为 **相对仓库根** 的路径；Cursor/MCP 的工作目录应为 harness-console 根（在仓库根打开工作区即可）。

```json
{
  "mcpServers": {
    "deeptutor": {
      "command": "bun",
      "args": ["run", "libs/deeptutor-bridge/src/mcp-server.ts"],
      "env": {}
    }
  }
}
```

可选：在 `env` 中设置下方变量，或在本机 shell 导出后再启动 CCB / Console。

从 `.mcp.json` 删除 `deeptutor` 条目并重启 Chat 相关进程后，agent 将不再看到 DeepTutor 工具。

### 工具（v1 仅两个）

| 工具 | 用途 |
|------|------|
| `status` | 探测 CLI 是否可用；可选 HTTP 探测 Web（`check_web`，默认 true） |
| `run` | 执行一次 capability（底层 `deeptutor run … --format json`），返回聚合后的文本回复 |

`run` 的 `capability`：`chat` · `deep_solve` · `deep_question` · `deep_research` · `visualize` · `math_animator` · `mastery_path`。

CLI 不在 PATH 时，`status` 返回 `cli_ok: false`，错误码 **`CLI_NOT_FOUND`**。

### Bridge 环境变量

可在 `.mcp.json` 的 `env` 或启动 MCP 父进程的环境中设置：

| 变量 | 默认 | 说明 |
|------|------|------|
| `DEEPTUTOR_BIN` | `deeptutor` | CLI 可执行文件；多 Python 环境建议写绝对路径 |
| `DEEPTUTOR_WEB_URL` | `http://127.0.0.1:3782` | `status` 返回的 `web_url` 与 Web 探测目标 |
| `DEEPTUTOR_HOME` | （未设置） | 若设置，传入子进程 env，供 DeepTutor 定位 workspace |
| `DEEPTUTOR_MCP_TIMEOUT_MS` | `120000` | `run` 超时（毫秒）；超时 kill 并返回 **`TIMEOUT`** |

Widget 面板的 URL 与 `DEEPTUTOR_WEB_URL` **独立**（localStorage 覆盖），两边不必一致。

## Widget Tab：看板

- 注册：`packages/widgets/deeptutor/`（`id: deeptutor`，`order: 60`）；`apps/web/src/main.tsx` side-effect import `@harness/widgets/deeptutor`。
- 顶栏 **DeepTutor** Tab → `DeepTutorPanel`：默认 iframe 指向 `http://127.0.0.1:3782`。
- **Web URL** 输入框 + **Apply** 写入 `localStorage` 键 `harness.deeptutor.webUrl`。
- **Refresh** 重载 iframe；**Open in new window** 在新标签打开（DeepTutor 若禁止 iframe / X-Frame 时页面可能空白，请用外开）。

Widget **不**调用 MCP；与 Chat 控制面解耦。

## 非目标（v1 明确不做）

- Console / Control **托管** DeepTutor 生命周期（`deeptutor start`、Docker、进程守护）
- 扩展 MCP：`kb_*` / `session_*` / memory / partner / skill 等工具
- WebSocket 流式桥、修改 DeepTutor 源码
- Control 反代剥离 X-Frame / CSP 以强制同源嵌入
- 与 headless pages、skill-factory 数据打通

## 手工验收（简要）

1. 未装 CLI：Chat 调 `status` → `CLI_NOT_FOUND`
2. 已装 CLI：`run` + `capability=chat` + 短 message → 有文本回复
3. Tab：外开可用；3782 可嵌则 iframe 可见，否则提示 + 外开
4. 移除 `.mcp.json` 中 `deeptutor` → 重启后 Chat 无该工具
