# CCB Settings — Ollama Endpoint（Cloud / Local / Remote）

**日期：** 2026-07-18  
**状态：** Draft（待用户确认后 Approved）  
**宿主：** `ccb`（`/config` Settings Ink UI + `~/.claude/settings.json`）  
**范围：** Settings 内 Endpoint 三选一（Cloud / Local Ollama / Remote Ollama）、自动拉模型列表、写回 OpenAI 兼容 env、会话内立即生效  
**非范围：** skill factory / widget panel、新建 `modelType: 'ollama'`、改 `/login` 主流程、vLLM 专用 UI、harness-console 控制台 Web Settings

## 背景与目标

CCB 已能通过 `/login` → OpenAI Compatible 对接 Ollama（`OPENAI_BASE_URL` + `modelType: 'openai'`），但用户必须手填 URL。本机已装 Ollama 时，日常切换仍绕远。

**目标：** 在 `/config`（Settings）增加 Endpoint 快切：

1. **Cloud** — 使用当前已配置的云端 provider  
2. **Local Ollama** — `localhost:11434`，自动列出本机模型并选用  
3. **Remote Ollama** — 用户填远程 Base URL（可选 API Key），自动列模型并选用  

底层继续走现有 OpenAI 兼容层，不新增 APIProvider。

## 架构结论

采用 **Settings 快切 + 复用 OpenAI 兼容路径**（方案 1）：

| 组件 | 职责 |
|------|------|
| Settings Config 页 `Endpoint` 项 | 三选一入口 + Remote URL/Key 表单 + 模型列表选择 |
| Ollama tags 客户端 | `GET {base}/api/tags`（Local 默认 `http://127.0.0.1:11434`）拉模型名 |
| `updateSettingsForSource('userSettings', …)` | 持久化 `modelType` + `env` + endpoint 元数据 |
| `clearOpenAIClientCache()` | URL/密钥变更后清客户端缓存，当前会话生效 |
| `/login` | 不变；仍负责完整 provider 首次配置 |

```
/config Endpoint
  ├─ Cloud          → 恢复 cloudSnapshot，清 ollama 覆盖
  ├─ Local Ollama   → 固定 localhost URL → /api/tags → 选模型 → 写 openai env
  └─ Remote Ollama  → 填 URL[/Key] → /api/tags → 选模型 → 写 openai env
```

## UI 与切换行为

入口：`/config` Config 页，靠近现有 Model 设置。

| 选项 | 行为 |
|------|------|
| **Cloud** | 恢复切到 Ollama 之前保存的 cloud 快照（`modelType` + 相关 `env`）。若无快照，保持当前非 Ollama 配置或提示先 `/login`。 |
| **Local Ollama** | `OPENAI_BASE_URL=http://127.0.0.1:11434/v1`，`OPENAI_API_KEY=ollama`，`modelType=openai`。拉 tags → 选模型。 |
| **Remote Ollama** | Base URL 必填；API Key 可选（默认 `ollama`）。规范化后带 `/v1` 写入 `OPENAI_BASE_URL`。拉 tags → 选模型。 |

**交互：**

- Local/Remote 选中后进入「选模型」子步；列表为空或请求失败时显示明确错误（服务未开 / URL 错 / 网络失败），不静默回退。
- 确认模型后立即写 user settings，并清 OpenAI client cache；无需重启。
- 同一模型名写入 `OPENAI_MODEL` 以及 `OPENAI_DEFAULT_HAIKU_MODEL` / `SONNET` / `OPUS`（三档同名），避免 `/model` 档位映射落空。

## 数据模型与持久化

写入 `~/.claude/settings.json`（userSettings）。

### 新增字段

```ts
type EndpointMode = 'cloud' | 'ollama-local' | 'ollama-remote'

interface Settings {
  // 现有
  modelType?: 'anthropic' | 'openai' | 'gemini' | 'grok'
  env?: Record<string, string>
  // 新增
  endpointMode?: EndpointMode
  /** 切到 Ollama 前的云端快照，供 Cloud 一键恢复 */
  cloudEndpointSnapshot?: {
    modelType?: Settings['modelType']
    env?: Record<string, string>
  }
  /** Remote 上次填写的 URL（不含 /v1 亦可），便于再次打开表单 */
  ollamaRemoteBaseUrl?: string
}
```

### Local / Remote 写入约定

| Key | Local | Remote |
|-----|-------|--------|
| `endpointMode` | `ollama-local` | `ollama-remote` |
| `modelType` | `openai` | `openai` |
| `env.OPENAI_BASE_URL` | `http://127.0.0.1:11434/v1` | 用户 URL（规范化为 `…/v1`） |
| `env.OPENAI_API_KEY` | `ollama` | 用户值或 `ollama` |
| `env.OPENAI_MODEL` + `OPENAI_DEFAULT_*` | 所选模型名 | 所选模型名 |
| `ollamaRemoteBaseUrl` | 不改或清空 | 保存用户输入 |

### 切到 Ollama 前

仅当当前 `endpointMode` 为 `cloud` 或未设置（且尚不在 ollama 模式）时，把当前 `modelType` + `env` 写入 `cloudEndpointSnapshot`。Ollama Local ↔ Remote 互切不覆盖该快照。

### 切回 Cloud

1. 若存在 `cloudEndpointSnapshot`：恢复其 `modelType` + `env`（至少恢复/清除 `OPENAI_*` 与快照一致）。  
2. 设 `endpointMode: 'cloud'`。  
3. 清 OpenAI client cache。  
4. 无快照且当前已是云端：no-op；无快照且当前是 Ollama：提示用 `/login` 重新配置云端。

不新增 `modelType: 'ollama'`；路由仍由 `getAPIProvider()` 走 `openai`。

## 错误处理

| 情况 | 处理 |
|------|------|
| Local：Ollama 未运行 / 连不上 | 错误文案提示启动 Ollama；不写 settings |
| Remote：URL 无效或 `/api/tags` 失败 | 显示失败原因；停留在 URL 表单 |
| Remote：URL 缺 scheme | 自动补 `http://` |
| 模型列表为空 | 提示先 `ollama pull`；不允许空确认 |
| 写 settings 失败 | 显示错误；不假装已切换 |

## 测试

- 单元：URL 规范化（补 `/v1`、去尾斜杠）；snapshot 保存/恢复不互相覆盖  
- 单元/集成：tags 响应解析 → 模型名列表  
- UI/命令级（可测则测）：选 Local 后 `modelType===openai` 且 BASE_URL 为 localhost；选 Cloud 后恢复 snapshot  
- 不测真实 GPU 推理；可用 mock `fetch` `/api/tags`

## 成功标准

1. `/config` 可见 Endpoint 三选一  
2. Local 在本机 Ollama 运行且已有模型时可一键选用（如 `qwen2.5:7b`）  
3. Remote 填可达 URL 后可选模型并生效  
4. Cloud 能恢复进入 Ollama 前的云端配置  
5. 切换后当前会话请求走对应端点，无需重启进程  

## 实现触及点（供计划阶段）

- `ccb/src/components/Settings/` — Config 页新增 Endpoint UI  
- `ccb/src/utils/settings/types.ts` — schema  
- 新建小模块：Ollama tags fetch + URL normalize  
- 复用：`updateSettingsForSource`、`clearOpenAIClientCache`、现有 OpenAI client  
- 测试：`ccb/src/…/__tests__/` 就近放置  
