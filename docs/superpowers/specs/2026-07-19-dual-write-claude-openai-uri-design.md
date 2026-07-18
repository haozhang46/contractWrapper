# Harness — Dual-write Claude Config + Correct OpenAI URI

**日期：** 2026-07-19  
**状态：** Approved（brainstorm：方案 1 + 双写 C + snapshot A + URI §1）  
**宿主：** `apps/web` Settings、`apps/control` `/api/llm`、`~/.claude/settings.json`、`ccb` `applyLlmEnv`  
**范围：** Remote/Local Save 时规范化 Base URL；双写 `.harness/llm.json` 与 Claude Code user settings；切 Remote 前 snapshot 云端并清抢路由项；切回 Cloud 恢复  
**非范围：** 重写 CCB OpenAI SDK、裸 `fetch` 替代 `ask()`、改 llama.cpp 服务端

## 背景

`qwen-chat.html` 请求：

```text
POST http://192.168.1.7:8080/v1/chat/completions
{ "model": "qwen2.5", "messages": [...], "stream": false }
```

Harness/CCB 经 `OPENAI_BASE_URL` + OpenAI SDK 拼出同一 URI。用户可粘贴完整 URL；须规范化后再写入配置。仅写 `llm.json` 时，独立 CCB CLI 仍可能走 `~/.claude/settings.json` 里的 Anthropic/DeepSeek。

## URI 规范化

输入 trim 后：

1. 若缺 scheme → 补 `http://`
2. 去掉尾斜杠
3. 若 path 以 `/chat/completions` 结尾 → 剥掉该后缀
4. 若 path 为空或 `/` → 设为 `/v1`
5. 若 path 无 `/v1` 后缀且不是已含 `/v1/` → 追加 `/v1`（origin-only 如 `http://host:8080` → `http://host:8080/v1`）
6. 结果写入 `llm.json.baseUrl` 与 `env.OPENAI_BASE_URL`

最终 HTTP：`{baseUrl}/chat/completions` ≡ HTML 的 `API`。

## 双写与 Snapshot

### Remote（或 Local Ollama）Save

1. 规范化 `baseUrl`；空 key → `ollama`
2. 写 `.harness/llm.json`（现有形状 + `endpointMode`）
3. 读 `~/.claude/settings.json`（userSettings）  
   - 若尚无 `cloudEndpointSnapshot`（或当前非 ollama 模式）：把当前 `modelType` + `env` 写入 `cloudEndpointSnapshot`  
4. 写回 user settings：  
   - `modelType: 'openai'`  
   - `endpointMode: 'ollama-remote' | 'ollama-local'`  
   - `env.CLAUDE_CODE_USE_OPENAI = '1'`  
   - `env.OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL`  
   - 同步 `OPENAI_DEFAULT_HAIKU_MODEL` / `SONNET` / `OPUS` = 同一 model  
   - **删除或清空**会抢路由的键：`ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_API_KEY`、以及 `CLAUDE_CODE_USE_GEMINI` / `CLAUDE_CODE_USE_GROK` 若存在  
5. `bounceDefaultSlot()`；子进程 `applyLlmEnv` 仍读 `llm.json`

### Cloud Save / 切回 Cloud

1. 若有 `cloudEndpointSnapshot`：恢复其 `modelType` + `env`  
2. `endpointMode: 'cloud'`  
3. 清 OpenAI 覆盖（与 snapshot 一致）  
4. 写 `llm.json` 为 Cloud 表单值；bounce

### 传输格式

不改 CCB OpenAI 层：Chat Completions JSON（`model`、`messages`、tools、stream）。成功标准：对 llama.cpp 的 URI 与 HTML 一致，body 为合法 chat completions。

## 错误处理

- 规范化失败（非法 URL）→ PUT 400，不写盘  
- `~/.claude/settings.json` 写失败 → PUT 仍写 `llm.json` 成功，但响应带 `warning`；UI 显示警告  
- 网络不可达不在 Save 时强制探测（可选后续）

## 测试

- 单元：`normalizeOpenAiBaseUrl` 三例（完整 chat URL、已有 /v1、仅 origin+port）  
- 单元：snapshot 保存/恢复不互相覆盖（Remote↔Local 不刷新 snapshot）  
- 集成：PUT remote 后 `llm.json` 与 mock 的 user settings 文件内容正确  
- 不测真实 GPU

## 成功标准

1. Settings 填 `http://192.168.1.7:8080/v1/chat/completions` + `qwen2.5` Save 后，`OPENAI_BASE_URL=http://192.168.1.7:8080/v1`  
2. `~/.claude/settings.json` 为 openai 路由，Anthropic DeepSeek 键已让路并已 snapshot  
3. 切回 Cloud 可恢复 snapshot  
4. 网络可达时 Chat 不再因错误 base（缺端口/双写路径）失败

## 实现触及点

- `apps/control/src/llm/normalizeOpenAiBaseUrl.ts`（新）  
- `apps/control/src/llm/claudeUserSettings.ts`（新）— 读写 `~/.claude/settings.json`  
- `apps/control/src/http/routes/llm.ts` — PUT 挂钩  
- `apps/web/src/components/llmRemoteSave.ts` — Save 前规范化（或依赖服务端唯一规范化）  
- 测试就近 `__tests__/`
