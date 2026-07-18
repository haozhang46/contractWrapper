# Harness Web — LLM Endpoint（Cloud / Local / Remote Ollama）

**日期：** 2026-07-18  
**状态：** Approved  
**宿主：** `harness-console`（`apps/web` LLM Settings + `apps/control` `/api/llm` + CCB slot 读 `.harness/llm.json`）  
**范围：** Web Settings Endpoint 三选一；`GET/PUT /api/llm`；Ollama tags 代理；保存后 bounce slot 子进程；每轮 turn 读 `llm.json`  
**非范围：** 仅改 CCB `/config` Ink（已实现但非本需求入口）；skill factory

## 背景

Chat 走可替换的 Agent Slot（默认 `CcbSlot`）。LLM 真相源是 workspace 的 `.harness/llm.json`；`ccb-runner` 每轮 `loadLLM` + `applyLlmEnv`。Web UI 已有 LLM Settings，但 `/api/llm` 未实现，改设置无法落盘，也无法同步 slot。

## 行为

### UI（`LLMSettings`）

- **Endpoint：** Cloud / Local Ollama / Remote Ollama  
- Local：`baseUrl=http://127.0.0.1:11434/v1`，`apiKey=ollama`，`provider=openai`，拉 tags 选 model  
- Remote：填 origin（缺 scheme 补 `http://`），可选 key（默认 `ollama`），拉 tags 选 model  
- Cloud：现有 Provider / Model / Base URL / API Key 表单  

### API

| 方法 | 路径 | 作用 |
|------|------|------|
| GET | `/api/llm` | 读 `.harness/llm.json`（缺省给 DeepSeek 默认值） |
| PUT | `/api/llm` | 写 `llm.json`，然后 **bounce** 默认 slot 子进程 |
| GET | `/api/llm/ollama/tags?origin=` | 代理 `{origin}/api/tags`，返回 `{ models: string[] }` |

### Slot 同步

```
Save → PUT /api/llm → write llm.json → cached CcbSlot.dispose()（杀子进程）
下一轮 Chat → ensureChild 拉起新进程 → runCCBAgent 读 llm.json → applyLlmEnv
```

- `getDefaultSlot` 进程内单例（按 workspaceRoot），Chat 与 LLM 路由共用  
- `bounceDefaultSlot()` = 对单例调用 `dispose()`，不清掉实例引用  
- 进行中的 turn 不热切换模型；保存后下一轮生效  

### `llm.json` 形状

```ts
{
  provider: string      // openai | anthropic | gemini | grok
  model: string
  baseUrl: string
  apiKey: string
  endpointMode?: 'cloud' | 'ollama-local' | 'ollama-remote'
}
```

### ccb-runner

`applyLlmEnv`：按 provider 设置/清理相关 env；openai 路径调用 `clearOpenAIClientCache()`。
