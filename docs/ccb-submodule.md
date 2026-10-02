# CCB Submodule 挂载与 Upstream 同步

`ccb/` 是 harness-console 的无头 Agent 基座（git submodule）。

| Remote | URL | 用途 |
|--------|-----|------|
| **origin** | `https://github.com/haozhang46/eee.git` | 本仓 fork；日常 push / 父仓钉住的 commit |
| **upstream** | `https://github.com/claude-code-best/claude-code.git` | 官方上游；只 fetch，按需同步 |

父仓 `.gitmodules` 指向 **origin（eee）**，不直接钉 upstream。产品逻辑放本仓 `apps/` / `packages/`；`ccb/` 只留无头钩子与必要改动。

**不要用 `pnpm patch`。** 改动在 fork 源码里维护，用 git 合流；patch 在上游演进时极易整块失效。

## Clone 与初始化

```bash
git clone --recurse-submodules <harness-console-url>
# 或已有 clone：
git submodule update --init --recursive
```

## 配置 upstream（每个 clone 一次）

```bash
cd ccb
git remote add upstream https://github.com/claude-code-best/claude-code.git
# 若已存在可跳过；检查：
git remote -v
```

## Upstream 同步（默认：path checkout）

eee ← upstream **默认用按路径同步**：只把上游指定文件/目录的当前内容搬进 fork，避免整仓大版本 merge。

```bash
cd ccb
git fetch upstream

# 查看与上游差异（可选）
git diff --stat HEAD upstream/main -- <paths...>

# 按路径取上游当前内容（覆盖工作区对应路径）
git checkout upstream/main -- <path1> <path2> ...
# 或：
# git restore --source=upstream/main -- <path1> <path2> ...

git status
git commit -m "sync(upstream): <简述路径与原因>"
git push origin HEAD
```

### 路径约定

- **可以同步：** 上游公共源码、你未大幅改过的目录（按需列出，例如某工具、某修复相关文件）。
- **不要盲目覆盖：** 本 fork 私有钩子与 harness 接入（例如 `src/harness/`），除非确认要对齐上游且已备份本地改动。
- 路径列表随任务变化；每次同步在 commit message 写清路径，便于回溯。

### 同步后更新父仓指针

```bash
cd <harness-console 根>
git add ccb
git status   # 应看到 ccb submodule 指针变更
git commit -m "chore(ccb): bump submodule after upstream path sync"
```

## 备选：cherry-pick 指定 commit

当明确只要上游某几个 commit（而非整文件最新内容）时：

```bash
cd ccb
git fetch upstream
git log --oneline HEAD..upstream/main          # 浏览
git cherry-pick <sha> [<sha>...]               # 或 <start>..<end>
git push origin HEAD
# 再回父仓 bump ccb 指针（同上）
```

commit message 建议带 `upstream: <sha>`，方便对照。

| 场景 | 用哪 |
|------|------|
| 要对齐某几个**文件/目录**的上游现状 | **path checkout**（默认） |
| 要跟上某几个**commit** | **cherry-pick** |
| 整线跟上 upstream/main | `merge` / `rebase`（少用；冲突面大） |

## 私有改动原则

1. 改动尽量薄：能放本仓 Control/Web 的不要塞进 `ccb/`。
2. 改公共文件时加清晰边界注释，方便下次 path sync / cherry-pick 定位冲突。
3. 通用修复优先向上游提 PR，减少 fork 私有 diff。
