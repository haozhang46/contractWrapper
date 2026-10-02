# Agent notes (harness-console)

Cursor / coding agents：仓库约定与同步 SOP。完整 submodule 文档见 [`docs/ccb-submodule.md`](./docs/ccb-submodule.md)。

## CCB → eee 同步 SOP

### 命名

| 名称 | 含义 |
|------|------|
| `ccb/` | 父仓 submodule 路径 |
| **eee** | fork（`origin` = `haozhang46/eee`） |
| **CCB** | eee 上游（remote 名 **`ccb`** = `claude-code-best/claude-code`） |

```
harness-console/ccb/
  origin → eee
  ccb    → CCB (claude-code-best/claude-code)
```

不要用 `pnpm patch`。

### 原则

1. **始终在 eee 分支上操作**；不要先 checkout 到某个 CCB version 再整仓 rebase。
2. **禁止日常全量 `rebase` 到 `ccb/main`**（eee 私有 commit 多）。
3. 多 version / 挑修复 → **cherry-pick**；要对齐某 ref 文件现状 → **path checkout**。
4. 同步后：`push` eee → 父仓 bump `ccb` 指针。

### 一句话

**path checkout = 指定路径后直接用 CCB 版本盖住；要冲突提示、只吃部分 diff，用 cherry-pick。**

| 场景 | 命令 | 冲突 |
|------|------|------|
| 文件/目录跟 CCB 某 ref 对齐 | `git checkout <ref> -- <paths>` | 无，直接 cover |
| 只要若干上游 commit | `git cherry-pick <sha>…` | 有 |
| 偶发整线对齐 | `git merge ccb/main` | 有；少用 |
| 全量 rebase 到 CCB | **不做** | — |

`<ref>`：`ccb/main` / tag / sha。

### 命令骨架

```bash
cd ccb
git fetch ccb

# A) 盖住
git checkout ccb/main -- <path1> <path2>

# B) 要冲突
git cherry-pick <sha> [<sha>...]

git push origin HEAD
cd .. && git add ccb && git commit -m "chore(ccb): bump submodule after CCB sync"
```

### 能看到 conflict 的方式

- **cherry-pick**（首选，部分 commit）
- **merge `ccb/main`**（整线）
- **rebase 到 `ccb/main`**（改写历史，非日常）
- **`git merge-file`**（单文件，少用）

path checkout **不会**产生 `<<<<<<<`。

### 私有改动

产品逻辑在 `apps/` / `packages/`；勿盲目 cover `src/harness/` 等 eee 钩子。详情与路径约定见 `docs/ccb-submodule.md`。
