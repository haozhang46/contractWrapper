# Skills 管理 + Chat `/` 选择器

**日期：** 2026-07-19  
**状态：** Approved（方案 1；用户确认 A+B、插入 `/name`、先启用再进 `/`、管理页 B）  
**宿主：** `harness-console`（`apps/control`、`apps/web`）  
**依赖：** CCB `getCommands` / skill 加载（project `.claude/skills`）；既有 `/api/skill-factory/*`  
**范围：** 统一 Skills 目录 API、Skills 管理 Tab（列表/查看/启用停用）、Chat input `/` 浮层插入 `/name`  
**非范围：** `SKILL.md` 在线编辑/新建/删除 CRUD；Skill Factory 评测流程改动；preload 会话绑定；微前端

## 背景与目标

Chat 输入仍是纯文本，无法发现/调用 skill；运行时与 Factory 资产分散，没有「启用 → 可调用」闭环。

**目标：**

1. **Skills 管理页**：聚合运行时（A）与 Factory（B）技能；列表、只读详情、启用/停用  
2. **Chat `/`**：仅展示**已启用**技能；选中插入 `/<name>`，发送走既有 CCB slash/Skill 路径  
3. **启用语义**：启用 = 同步到 CCB 可加载目录；停用 = 从该目录移除并记录状态

## 架构结论

采用 brainstorming **方案 1**：Control 统一 `/api/skills` + Web 固定 Skills Tab + Chat `/` 浮层。

```
┌─────────────┐     GET/POST /api/skills*      ┌──────────────────────┐
│ apps/web    │ ─────────────────────────────► │ apps/control         │
│ SkillsPanel │                                │ skills/store + sync  │
│ Chat `/`    │ ◄── enabled-only for picker ── │ registry.json        │
└─────────────┘                                └──────────┬───────────┘
                                                          │ enable sync
                                                          ▼
                                               .claude/skills/<id>/   ← CCB getCommands
                                               .harness/skills/       ← runtime catalog (source)
                                               skill-assets/{zone}/   ← factory catalog (via existing tools)
```

不扩展 Skill Factory Widget 兼做管理页；Factory 面板继续只管生产/评测。

## 数据模型

### 注册表（启用态事实源）

路径：`<workspace>/.harness/skills-registry.json`

```ts
type SkillSource = 'runtime' | 'factory'
type SkillZone = 'staging' | 'published'

type SkillRegistryEntry = {
  id: string
  source: SkillSource
  zone?: SkillZone          // factory only; default 'published' when enabling if omitted
  enabled: boolean
  updatedAt: string         // ISO
}

type SkillRegistry = {
  version: 1
  entries: SkillRegistryEntry[]
}
```

- 缺文件 → `{ version: 1, entries: [] }`
- `id` 全局唯一；同名 runtime 与 factory 冲突时：**启用方覆盖**安装目录，注册表保留双方条目但 `/` 与安装只能有一份（后者 enable 胜出，前者 `enabled` 强制 false 并写审计日志字段可选；本轮实现：后写 enable 失败并返回 `409 CONFLICT`）

### 目录角色

| 路径 | 角色 |
|------|------|
| `.harness/skills/<id>/SKILL.md` | **Runtime 目录源**：本地/沉淀 skill 的权威内容 |
| `skill-assets/{staging\|published}/<id>/` | **Factory 目录源**（只读于本功能；经既有 `skill.list` / `skill.get`） |
| `.claude/skills/<id>/` | **运行时安装面**：仅已启用 skill；CCB project skills 原生路径 |

### 列表项（API 对外）

```ts
type SkillListItem = {
  id: string
  name: string              // slash 名，默认 = id
  description: string       // 来自 SKILL.md frontmatter 或摘要首行；缺省 ''
  source: SkillSource
  zone?: SkillZone
  enabled: boolean
  installed: boolean        // .claude/skills/<id> 是否存在
}
```

## Control HTTP

前缀：`/api/skills`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 聚合列表。Query：`enabled=true` → 仅已启用；默认全部 |
| GET | `/:id` | 详情：元数据 + `skillMd` 正文（优先安装面，否则源目录） |
| POST | `/:id/enable` | body 可选 `{ source, zone? }`；同步到 `.claude/skills/<id>/`；写 registry |
| POST | `/:id/disable` | 删除 `.claude/skills/<id>/`；registry `enabled: false` |

信封：与现有 API 对齐，可用 `{ ok, data, error }` 或直接 JSON（实现时跟 `memory`/`skill-factory` 之一保持一致，优先简单 JSON + HTTP status）。

错误：

- `404` skill 在两源皆不存在  
- `409` 启用时 id 已被另一 source 占用且已 enabled  
- `503` factory 源需要 submodule 但未初始化（仅 factory enable/list 分支）

### 聚合规则

1. 扫描 `.harness/skills/*/SKILL.md` → `source: 'runtime'`  
2. 调用既有 `skillList(assetsRoot)`（若 submodule 可用）→ `source: 'factory'`，带 `zone`  
3. 合并 registry 的 `enabled`；无条目 → `enabled: false`  
4. `installed` = 存在 `.claude/skills/<id>/SKILL.md`  
5. `GET ?enabled=true`：`enabled && installed`（保证 `/` 看得见就能跑）

### 启用 / 停用

**enable（runtime）：** 从 `.harness/skills/<id>/` 递归复制到 `.claude/skills/<id>/`（至少 `SKILL.md`）。  
**enable（factory）：** 从 `skill-assets/<zone>/<id>/` 复制到 `.claude/skills/<id>/`（默认 zone=`published`，允许 `staging`）。  
**disable：** `rm -rf .claude/skills/<id>`；registry 标记 `enabled: false`。不删目录源。

不改 CCB 加载逻辑：安装面即 `.claude/skills`，与 `getCommands(workspaceRoot)` 一致。

## Web UI

### Skills Tab（固定 Tab，与 Chat / Settings 并列）

- `shellTabs` / `App.tsx` 增加固定 tab `'skills'`  
- `SkillsPanel`：两区分组或表格列 `source`；开关启用；点击行打开只读 `skillMd`（`<pre>` 即可）  
- 复用现有 `.shell__*` / `.settings*` / `.form-field*` 类，不新开视觉体系

### Chat `/` 浮层

- 输入以 `/` 开头（或光标前为 `/` + 过滤词）时弹出列表  
- 数据：`GET /api/skills?enabled=true`（可缓存至会话，Skills 页 enable 后可选刷新）  
- 键盘：↑↓ 选择、Enter 确认、Esc 关闭  
- 确认：将当前 `/…` token 替换为 `/<name>`（可保留后续参数空格）  
- 发送逻辑不变：整段文本进既有 chat stream；CCB `ask()` + commands 处理 slash

## 测试

- Control：`bun:test` — 聚合、enable 复制、disable 删除、`enabled=true` 过滤、409 冲突  
- Web：纯函数测 slash 过滤 / 插入（无 DOM 或轻量）；面板可测 fetch 映射若拆 `api.ts`

## 非目标再强调

- 不做在线编辑器  
- 不把 Factory 评测塞进 Skills 页  
- 不改 skill-factory MCP 契约  
- 不引入会话级 preload 第二种绑定方式
