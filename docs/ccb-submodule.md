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

eee ← **CCB（remote `ccb`）** 默认按路径同步：只搬指定文件/目录的当前内容，避免整仓大版本 merge。

```bash
cd ccb
git fetch ccb

# 查看与 CCB 差异（可选）
git diff --stat HEAD ccb/main -- <paths...>

# 按路径取 CCB 当前内容（覆盖工作区对应路径）
git checkout ccb/main -- <path1> <path2> ...
# 或：
# git restore --source=ccb/main -- <path1> <path2> ...

git status
git commit -m "sync(ccb): <简述路径与原因>"
git push origin HEAD
```

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

| 场景 | 用哪 |
|------|------|
| 要对齐某几个**文件/目录**的 CCB 现状 | **path checkout**（默认） |
| 要跟上某几个**commit** | **cherry-pick** |
| 整线跟上 `ccb/main` | `merge` / `rebase`（少用；冲突面大） |

## 私有改动原则

1. 改动尽量薄：能放本仓 Control/Web 的不要塞进 `ccb/`。
2. 改公共文件时加清晰边界注释，方便下次 path sync / cherry-pick 定位冲突。
3. 通用修复优先向 **CCB** 提 PR，减少 eee 私有 diff。
