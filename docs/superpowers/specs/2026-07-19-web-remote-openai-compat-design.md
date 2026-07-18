# Harness Web — Remote Endpoint（手填 OpenAI 兼容）

**日期：** 2026-07-19  
**状态：** Approved  
**宿主：** `apps/web` LLM Settings + `apps/control` `/api/llm` + `ccb` `runCCBAgent` / `applyLlmEnv`  
**范围：** 将 Web Settings 的 **Remote Ollama** 改为手填 Base URL / Model / API Key，去掉 Host 归一化与 List models  
**非范围：** Local Ollama 行为、Cloud 表单、CCB `/config` Ink、改 `applyLlmEnv` 协议、llama.cpp 服务端本身

## 背景

当前 Remote UI 假定 Ollama：只填 origin → 强制 `${origin}/v1`，并用 `{origin}/api/tags` 拉模型。  
用户实际常用 **llama.cpp** 等 OpenAI 兼容服务（如 `http://192.168.1.7:8080/v1`），模型名手填（如 `qwen2.5`）。漏端口会落到 `:80`，List models 走错协议，导致 Connection error。

Slot 路径已明确（不必再发明协议）：

1. Settings → `.harness/llm.json`：`{ provider, model, baseUrl, apiKey, endpointMode }`
2. `runCCBAgent` → `applyLlmEnv`：`CLAUDE_CODE_USE_OPENAI=1`、`OPENAI_BASE_URL`、`OPENAI_MODEL`、`OPENAI_API_KEY`
3. OpenAI SDK：`POST {OPENAI_BASE_URL}/chat/completions`

与浏览器 `fetch('…/v1/chat/completions', { model, messages })` 同一协议；Settings 只负责把三项写对。

## 行为

### Remote 表单（`endpointMode: 'ollama-remote'`）

| 字段 | 行为 |
|------|------|
| Base URL | 用户完整填写，**原样**写入 `baseUrl`（不 strip path、不强制补 `/v1`、不从 origin 推导） |
| Model | 手填，原样写入 `model` |
| API Key | 可选；空则保存时默认 `ollama`（因 `runCCBAgent` 在 `!apiKey` 时直接提示配置 key） |

- **删除：** Ollama Host 输入、`List models` 按钮、Remote 路径上对 `/api/tags` 的调用与 `remoteOrigin` 状态机  
- **保留：** `endpointMode` 字面量 `ollama-remote`（兼容已有 `llm.json`）；Local 仍用 tags；Cloud 不变  
- **文案：** Endpoint 选项可显示为 `Remote`（或 `Remote (OpenAI compatible)`）；内部值仍为 `ollama-remote`

### Save

`PUT /api/llm` 现有路径不变：写 `llm.json` → `bounceDefaultSlot()`。

示例：

```json
{
  "provider": "openai",
  "model": "qwen2.5",
  "baseUrl": "http://192.168.1.7:8080/v1",
  "apiKey": "ollama",
  "endpointMode": "ollama-remote"
}
```

### 加载

若已有 `ollama-remote` 配置，直接把 `baseUrl` / `model` / `apiKey` 填回表单（不要再拆成 origin）。

## 错误处理

- Base URL / Model 为空时禁止 Save（或 Save 后 runner 失败——优先 UI 禁用 Save）  
- 不在 Remote 上再做网络探活（用户自测 URL）

## 测试

- 组件/单元：选 Remote 后无 List models；Save payload 的 `baseUrl` 等于输入（含自定义 path）  
- 回归：Local 仍可 Refresh models / Start Ollama  
- 不测真实 GPU / 局域网

## 成功标准

1. Remote 可填 `http://192.168.1.7:8080/v1` + `qwen2.5` + 占位 key 并保存  
2. 下一轮 Chat slot 使用该 baseUrl/model，不再因默认端口 80 或 `/api/tags` 失败  
3. Local Ollama 行为不被破坏  

## 实现触及点

- `apps/web/src/components/LLMSettings.tsx` — Remote UI  
- 可选：更新 `docs/superpowers/specs/2026-07-18-web-llm-endpoint-design.md` 中 Remote 段落指向本文  
- 测试：就近 `apps/web` 或 control 已有 LLM 测试旁补充（若无组件测试基建，以纯函数抽取 normalize/save payload 测之为准）
