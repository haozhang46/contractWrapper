# Skill Factory 挂载

## Clone

git clone --recurse-submodules <harness-console-url>
# 或
git submodule update --init --recursive

## 启动 MCP（供 CCB / Agent 连接）

cd skill-factory && bun install && bun run mcp

## CCB MCP 配置示例（stdio）

在 CCB mcp 设置中增加：

{
  "skill-factory": {
    "command": "bun",
    "args": ["run", "mcp/src/server.ts"],
    "cwd": "<absolute-path-to>/harness-console/skill-factory"
  }
}

控制面：Chat 经 Agent 调 skill-factory tools。看板 iframe 可选，后续再加。
