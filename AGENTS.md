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

不要用 **`pnpm patch`**（那是 npm 依赖补丁；上游一变极易整块失效，且和 submodule fork 模型拧着）。若要用「补丁文件」，用下面的 **git patch**。

### 原则

1. **始终在 eee 分支上操作**；不要先 checkout 到某个 CCB version 再整仓 rebase。
2. **禁止日常全量 `rebase` 到 `ccb/main`**（eee 私有 commit 多）。
3. 多 version / 挑修复 → **cherry-pick**（首选）或 **`format-patch` + `am`**；要对齐某 ref 文件现状 → **path checkout**。
4. 同步后：`push` eee → 父仓 bump `ccb` 指针。

### 一句话

**path checkout = 指定路径后直接用 CCB 版本盖住；要冲突提示、只吃部分 diff，用 cherry-pick（或 git am）。**

| 场景 | 命令 | 冲突 |
|------|------|------|
| 文件/目录跟 CCB 某 ref 对齐 | `git checkout <ref> -- <paths>` | 无，直接 cover |
| 只要若干上游 commit | `git cherry-pick <sha>…` | 有 |
| 要可存档/可传的补丁包 | `format-patch` → `git am` | 有（am 会停） |
| 一次性手搓 diff | `git diff` → `git apply`（可选 `--3way`） | apply 常失败留 `.rej`；`--3way` 才像 merge |
| 偶发整线对齐 | `git merge ccb/main` | 有；少用 |
| 全量 rebase 到 CCB | **不做** | — |
| `pnpm patch` | **不做** | — |

`<ref>`：`ccb/main` / tag / sha。

### 命令骨架

```bash
cd ccb
git fetch ccb

# A) 盖住
git checkout ccb/main -- <path1> <path2>

# B) cherry-pick（要冲突）
git cherry-pick <sha> [<sha>...]

# C) git am SOP（补丁包；要存档/传审时用；日常仍优先 cherry-pick）
rm -rf /tmp/ccb-patches && mkdir -p /tmp/ccb-patches
git log --oneline <start>..<end>                    # 确认区间
git format-patch -o /tmp/ccb-patches <start>..<end> # 或 -1 <sha>
# 可选：审 /tmp/ccb-patches/*.patch
git am /tmp/ccb-patches/*.patch
# 冲突：编辑 → git add → git am --continue
# 跳过当前封：git am --skip （慎用）
# 整段放弃：git am --abort

# D) 单次 diff 补丁（临时；不如 cherry-pick）
git diff HEAD ccb/main -- path/foo.ts > /tmp/foo.patch
git apply --3way /tmp/foo.patch   # 尽量走三方，才可能有 <<<<<<<

git push origin HEAD
cd .. && git add ccb && git commit -m "chore(ccb): bump submodule after CCB sync"
```

### 能看到 conflict 的方式

- **cherry-pick**（首选，部分 commit）
- **`git am`**（format-patch 打进来时）
- **`git apply --3way`**（单补丁；普通 `git apply` 多半只失败/`.rej`，没有标准冲突标记）
- **merge `ccb/main`**（整线）
- **rebase 到 `ccb/main`**（改写历史，非日常）
- **`git merge-file`**（单文件，少用）

path checkout **不会**产生 `<<<<<<<`。`pnpm patch` 不在本 SOP 内。

### path checkout（cover）风险 — 用前必须提示用户

`git checkout <ref> -- <paths>` / `git restore --source=...` 是 **直接覆盖**，不是合并：

- **无冲突提示**，不会出现 `<<<<<<<`；本地同路径内容直接变成 CCB 版本。
- **未提交改动可能被盖掉**且难以找回；已提交的 eee 独有修改也会从工作树消失（历史里还在，但当前文件已是上游版）。
- **私有钩子高危路径**（如 `src/harness/`）禁止在未确认、未备份/未 commit 时 cover。
- Agent **不得擅自**对未点名的路径做 path checkout；执行前须列出路径并请用户确认「接受直接盖住、无 conflict 提示」。

若用户需要看冲突再合 → 改用 **cherry-pick** / **git am**，不要用 path checkout。

### 私有改动

产品逻辑在 `apps/` / `packages/`；勿盲目 cover `src/harness/` 等 eee 钩子。详情与路径约定见 `docs/ccb-submodule.md`。
