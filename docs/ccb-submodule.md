# CCB Submodule 挂载与同步

本地目录 `ccb/` 是 harness-console 的无头 Agent 基座（git submodule）。命名关系：

| 名称 | 是什么 |
|------|--------|
| **`ccb/`** | 父仓里的 submodule 路径 |
| **eee** | fork 仓 `haozhang46/eee`（`origin`；父仓 `.gitmodules` 指向这里） |
| **CCB** | eee 的上游 `claude-code-best/claude-code`（remote 名 **`ccb`**） |

```
harness-console
  └── ccb/          ← submodule 工作树
        origin  → eee (haozhang46/eee)
        ccb     → CCB 上游 (claude-code-best/claude-code)
```

产品逻辑放本仓 `apps/` / `packages/`；`ccb/` 只留无头钩子与必要改动。

**不要用 `pnpm patch`。** 改动在 eee 源码里维护，从 CCB 用 git 合流。

## Clone 与初始化

```bash
git clone --recurse-submodules <harness-console-url>
# 或已有 clone：
git submodule update --init --recursive
```

## 配置 CCB 上游 remote（每个 clone 一次）

```bash
cd ccb
git remote add ccb https://github.com/claude-code-best/claude-code.git
# 若已存在可跳过；检查：
git remote -v
# 期望：
# origin  → haozhang46/eee.git
# ccb     → claude-code-best/claude-code.git
```

## 从 CCB 同步到 eee（默认：path checkout）

eee ← **CCB（remote `ccb`）** 默认按路径同步。

**一句话：**  
**path checkout = 指定路径后直接用 CCB 版本盖住；要冲突提示、只吃部分 diff，用 cherry-pick。**

它**不是**「自动扫某个 commit 改了哪些文件再合并」。流程是：

1. （可选）自己看差异 / 某 commit 动了哪些路径  
2. 选定路径后 `checkout` / `restore` → **整份覆盖**，无三方合并

```bash
cd ccb
git fetch ccb

# 可选：看相对 CCB 差哪些文件，或某 commit 改了啥
git diff --name-only HEAD ccb/main
git show --name-only <sha>

# 按路径取 CCB 当前内容（覆盖工作区 + index 对应路径）
git checkout ccb/main -- <path1> <path2> ...
# 或：
# git restore --source=ccb/main -- <path1> <path2> ...

git status
git commit -m "sync(ccb): <简述路径与原因>"
git push origin HEAD
```

### path checkout 会不会报 conflict？

**不会。** 没有 `<<<<<<<`，不做 merge：

- 指定路径 = CCB 上那一版内容（直接 cover）
- 本地未提交改动也可能被盖掉；**不要指望弹出冲突让你选**

**用户风险（执行前必须说明并确认）：**

- 直接盖住，工作区/index 上这些路径的当前内容以 CCB 为准；**未提交修改可能永久丢失**。
- eee 上已提交的同路径私有改动不会从历史删除，但 **当前树会被上游版替换**，等于丢掉工作区里的分叉内容。
- **高危路径**（如 `src/harness/`）：未备份/未 commit、未明确点名时不要 cover。
- Agent / 自动化：**不得**对用户未确认的路径执行 path checkout；需要冲突提示时改用 cherry-pick / `git am`。

| | path checkout | cherry-pick |
|--|--|--|
| 单位 | 文件/目录的**整份当前内容** | **某个 commit** 的 patch |
| 冲突 | 无，直接覆盖 | 有，停下来让你解 |
| 适合 | 「这几个文件就跟 CCB 现状对齐」（已确认可盖） | 「只要那几次修复的改动」 |

### 路径约定

- **可以同步：** CCB 公共源码、你未大幅改过的目录（按需列出）。
- **不要盲目覆盖：** 本 fork 私有钩子与 harness 接入（例如 `src/harness/`），除非确认要对齐上游且已备份本地改动。
- 路径列表随任务变化；每次同步在 commit message 写清路径，便于回溯。

### 同步后更新父仓指针

```bash
cd <harness-console 根>
git add ccb
git status   # 应看到 ccb submodule 指针变更
git commit -m "chore(ccb): bump submodule after CCB path sync"
```

## 备选：cherry-pick 指定 commit

当明确只要 CCB 某几个 commit（而非整文件最新内容）时：

```bash
cd ccb
git fetch ccb
git log --oneline HEAD..ccb/main          # 浏览
git cherry-pick <sha> [<sha>...]          # 或 <start>..<end>
git push origin HEAD
# 再回父仓 bump ccb 指针（同上）
```

commit message 建议带 `ccb: <sha>`，方便对照。

## 多 version：停在 eee 上挑，不要全量 rebase

eee 上已有 harness 等私有 commit 时：

- **始终在 eee 分支操作**；不必先 `checkout` 到某个 CCB version 再干活。
- **禁止日常** `git rebase` 整线到 `ccb/main`（冲突面大、改写历史）。
- 多 version 里只要若干修复 → **`git cherry-pick <sha>…`**（可看 conflict）。
- 某个 tag/sha 上的文件现状要对齐 → **`git checkout <tag-or-sha> -- <paths>`**（直接盖住）。
- 偶发整线对齐才用 **`git merge ccb/main`**。

## 备选：git patch（不是 pnpm patch）

**禁止 `pnpm patch`。** 那是给 registry 依赖打补丁的；和 submodule fork 无关，上游一变极易整块失效。

若需要「补丁文件」形态（可审查、可存档、可跨仓传），用 git：

### `format-patch` + `git am`（推荐的 patch 路径）

等价于把一段 commit 导出成 `.patch` 再打进 eee；**冲突时 `am` 会停住**（类似 cherry-pick）。

```bash
cd ccb
git fetch ccb
git format-patch -o /tmp/ccb-patches <start>..<end> -- optional/path/
git am /tmp/ccb-patches/*.patch
# 冲突：编辑 → git add → git am --continue
# 放弃：git am --abort
```

与 cherry-pick 比：多一层补丁文件 intermediate；日常仍优先 cherry-pick，除非要存档/传给别人。

### `git diff` + `git apply`（临时手搓）

```bash
git diff HEAD ccb/main -- path/foo.ts > /tmp/foo.patch
# 可先改 patch 再打
git apply --3way /tmp/foo.patch   # 尽量开三方，才可能出现 <<<<<<<
# 普通 git apply：失败或留下 .rej，通常没有标准 conflict 标记
```

适合极小、一次性改动；长期维护成本高。

## 还有哪些方式能看到 conflict？

除 cherry-pick 外，凡是走 **三方合并** 的都会停在冲突上：

| 方式 | 何时用 | 冲突行为 |
|------|--------|----------|
| **`cherry-pick`** | 只要若干 commit 的 patch | 有冲突则 pause，解完再 `--continue` |
| **`git am`** | format-patch 打补丁包 | 同 cherry-pick，pause 后 `--continue` / `--abort` |
| **`git apply --3way`** | 单文件/手搓 patch | 才可能有 `<<<<<<<`；普通 `apply` 多半失败/`.rej` |
| **`merge ccb/main`** | 整线合入 CCB | 冲突文件带 `<<<<<<<`；范围大 |
| **`rebase` 到 `ccb/main`** | 把 eee 独有 commit 接到 CCB 尖上 | 逐 commit 可能冲突；改写历史，非日常 |
| **单文件 `git merge-file`** | 只要某几个文件、又想要冲突标记 | 手动取出 ours/base/theirs（少用） |

实用建议：

- **默认同步路径、接受盖住** → path checkout  
- **要冲突提示 / 只吃部分 diff** → cherry-pick（或 `format-patch` + `am`）  
- **偶尔整线对齐** → `merge`（不要日常 rebase）  
- **不要**用 `pnpm patch`  
- 想「只合某目录又要冲突」：没有一等公民的 path-merge；常见做法是 `merge` 后把不想要的路径 `git checkout HEAD -- unwanted/` 还原，或对目标文件用 `merge-file`

```bash
# 整线 merge 示例（冲突会停住）
cd ccb
git fetch ccb
git merge ccb/main
# 解冲突 → git add → git commit
```

| 场景 | 用哪 |
|------|------|
| 要对齐某几个**文件/目录**的 CCB 现状，可直接盖 | **path checkout**（默认） |
| 要跟上某几个**commit**，需要冲突提示 | **cherry-pick** |
| 要可存档/可传的补丁包 | **format-patch + am** |
| 整线跟上 `ccb/main`，接受大范围冲突 | **merge** /（少用）**rebase** |

## 私有改动原则

1. 改动尽量薄：能放本仓 Control/Web 的不要塞进 `ccb/`。
2. 改公共文件时加清晰边界注释，方便下次 path sync / cherry-pick 定位冲突。
3. 通用修复优先向 **CCB** 提 PR，减少 eee 私有 diff。
