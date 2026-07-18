# Harness 中控台

北极星与 Spec 在 `docs/superpowers/`。  
**实现基座：** git submodule [`ccb/`](./ccb/) → [claude-code-best/claude-code](https://github.com/claude-code-best/claude-code)（无头 Agent；不用其终端 UI）。

## 克隆本仓

```bash
git clone --recurse-submodules <本仓 URL>
# 若已克隆未拉 submodule：
git submodule update --init --recursive
```

## 本地跑 CCB

```bash
export PATH="$HOME/.bun/bin:$PATH"
cd ccb
bun install   # 若尚未安装
bun run build
bun run dev   # 需真实终端 TTY；或 bun dist/cli-bun.js
```

首次在 REPL 内 `/login` 配置模型供应商。

## 本地跑中控（分离后）

```bash
bun install
bun run control:dev   # :3100 HTTP + MCP
bun run web:dev       # :5173 → proxy /api → :3100
# 另开终端：bun run agent:dev  # CCB 无头 + Control MCP（fail-closed）
```

**验收（fail-closed）：** 布局与单元测试须全部通过，否则脚本非零退出。

```bash
./scripts/acceptance-separation.sh
```

## Skill Factory

git submodule [`skill-factory/`](./skill-factory/) → [haozhang46/skill-factory](https://github.com/haozhang46/skill-factory)（约定驱动 Skill 生产与评测；嵌套 `skill-assets`）。

挂载与 MCP 接入见 [Skill Factory 挂载](./docs/skill-factory-submodule.md)。

## 文档

- [北极星架构](./docs/superpowers/specs/2026-07-17-harness-control-console-north-star-design.md)
- [Spec 线](./docs/superpowers/specs/2026-07-17-harness-control-console-spec-line.md)
- [会话交接（下一个 Chat 从这里继续）](./docs/superpowers/handoffs/2026-07-17-continue-from-ccb-understand.md)
