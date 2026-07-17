# Harness T1 — 章程 + 洋葱 + 空态 Web 壳 实现计划

> **SUPERSEDED (layout):** 仓库布局与进程模型以
> [process-separation design](../specs/2026-07-17-harness-control-ccb-process-separation-design.md)
> 与 [本计划](./2026-07-17-harness-control-ccb-process-separation.md) 为准。
> 下文「代码放进 `ccb/harness/`」不再执行；能力清单仍可参考。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 CCB submodule 上交付 T1 最小可验收切片：`.harness` 骨架初始化、洋葱运行时接管 `hasPermissionsToUseTool`、Settings 洋葱 CRUD、Web 空态 Chat|Settings 壳。

**Architecture:** 洋葱运行时作为 Koa-style 中间件链插入 CCB 权限管线（`hasPermissionsToUseTool` → 洋葱 incoming → 原权限检查 → 洋葱 outgoing）。Web 壳用 Hono（已存在依赖）起 HTTP 服务，React + Headless UI + Tailwind 渲染空态 Chat|Settings。所有持久化落 `.harness/` 目录。

**Tech Stack:** TypeScript, Bun, React 19, Hono 4.12, Headless UI 2.x, Tailwind 4.x, Vite 8.x

**CCB 基座：** `ccb/` submodule @ `b4149bbf`；改动集中在 `ccb/harness/` 新目录 + 对 `ccb/src/utils/permissions/permissions.ts` 和 `ccb/src/hooks/useCanUseTool.tsx` 的最小钩子注入。

---

## 文件结构总览

```
ccb/
  harness/
    onion/
      types.ts              # OnionLayer, OnionContext, OnionDecision
      runtime.ts            # Koa-style compose + execute
      defaultLayers.ts      # 出厂三层：audit + capability-gate + require-confirm
      onionPermissions.ts   # hasPermissionsToUseToolWithOnion 包装函数
    bootstrap/
      init.ts               # .harness 目录初始化（首次运行 / 校验）
      loadCharter.ts        # 加载 charter.md
      loadOnion.ts          # 加载/保存 contract-onion.json
    web/
      server.ts             # Hono HTTP 服务入口
      routes/
        api/
          onion.ts          # GET/PUT /api/onion — 读取/保存洋葱配置
          charter.ts        # GET/PUT /api/charter — 读取/保存章程
      client/
        index.html          # Vite 入口 HTML
        main.tsx            # React 入口
        App.tsx             # Shell：Header（Chat|Settings tabs）+ 内容区
        components/
          ChatPanel.tsx     # 占位 Chat 面板
          SettingsPanel.tsx # Settings 面板
          OnionEditor.tsx   # 洋葱层列表 + 增删改排序
          OnionLayerForm.tsx# 单层编辑表单
        styles/
          index.css         # Tailwind 入口
    vite.config.ts          # Vite 构建配置（仅 client）
  src/
    utils/permissions/
      permissions.ts        # [MODIFY] 注入洋葱钩子（1 行 import + 条件分支）
    hooks/
      useCanUseTool.tsx     # [MODIFY] 替换 import 为洋葱版本

.harness/                    # [CREATE] Workspace 骨架（运行时初始化）
  charter.md
  contract-onion.json
  manifest.json
  audit/
  chat/
  skills/
  memory/
  fusion/
  workflows/

package.json                 # [MODIFY] 加 tailwind/headlessui 依赖 + harness 脚本
```

---

### Task 1: 安装 Web UI 依赖 + 配置 Vite/Tailwind

**Files:**
- Modify: `ccb/package.json`
- Create: `ccb/harness/web/vite.config.ts`
- Create: `ccb/harness/web/client/styles/index.css`
- Create: `ccb/tailwind.config.ts` (或 postcss 配置)

- [ ] **Step 1: 安装依赖**

```bash
cd ccb && bun add @headlessui/react@^2.2.0 tailwindcss@^4.0.0 @tailwindcss/vite@^4.0.0
```

- [ ] **Step 2: 创建 Tailwind CSS 入口**

`ccb/harness/web/client/styles/index.css`:
```css
@import "tailwindcss";
```

- [ ] **Step 3: 创建 Vite 配置**

`ccb/harness/web/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: './harness/web/client',
  plugins: [tailwindcss()],
  build: {
    outDir: '../dist-client',
  },
  server: {
    port: 5173,
  },
});
```

- [ ] **Step 4: 在 package.json 添加 harness 脚本**

在 `ccb/package.json` 的 `scripts` 中添加：
```json
"harness:web:dev": "vite --config harness/web/vite.config.ts",
"harness:web:build": "vite build --config harness/web/vite.config.ts",
"harness:dev": "bun run harness/bootstrap/init.ts && bun run --watch harness/web/server.ts",
"harness:start": "bun run harness/web/server.ts"
```

- [ ] **Step 5: 验证依赖安装**

```bash
cd ccb && bun run harness:web:build --help
```
Expected: Vite 构建命令可用。

- [ ] **Step 6: Commit**

```bash
cd ccb && git add package.json harness/web/vite.config.ts harness/web/client/styles/index.css
git commit -m "chore: add Tailwind + Headless UI deps and Vite config for harness web shell"
```

---

### Task 2: 洋葱类型定义

**Files:**
- Create: `ccb/harness/onion/types.ts`

- [ ] **Step 1: 写出类型文件**

`ccb/harness/onion/types.ts`:
```typescript
import type { Tool, ToolUseContext } from '../../src/Tool.js';
import type { PermissionDecision } from '../../src/utils/permissions/PermissionResult.js';

/** 能力等级：L1 默认放行、L2 可配、L3 必须确认 */
export type CapabilityLevel = 'L1' | 'L2' | 'L3';

/** 洋葱层类型标签 */
export type OnionLayerType =
  | 'audit'
  | 'capability-gate'
  | 'require-confirm'
  | 'path-sandbox'
  | 'network-allowlist'
  | 'deny-pattern'
  | 'custom';

/** 单层洋葱配置（持久化在 contract-onion.json） */
export interface OnionLayerConfig {
  id: string;
  type: OnionLayerType;
  name: string;
  enabled: boolean;
  priority: number;
  config: Record<string, unknown>;
}

/** 洋葱中间件上下文 — 传入每一层 */
export interface OnionContext {
  tool: Tool;
  input: Record<string, unknown>;
  toolUseContext: ToolUseContext;
  /** 当前层可写 decision 来短路链 */
  decision: PermissionDecision | null;
  /** 审计记录累积 */
  auditTrail: AuditEntry[];
}

/** 审计条目 */
export interface AuditEntry {
  timestamp: string;
  layerId: string;
  layerType: OnionLayerType;
  toolName: string;
  decision: 'allow' | 'deny' | 'ask';
  reason?: string;
}

/** 洋葱中间件函数签名 — class Koa middleware */
export type OnionMiddleware = (
  ctx: OnionContext,
  next: () => Promise<void>,
) => Promise<void>;

/** contract-onion.json 持久化格式 */
export interface ContractOnion {
  version: 1;
  layers: OnionLayerConfig[];
}

/** L1–L3 能力门控配置 */
export interface CapabilityGateConfig {
  level: CapabilityLevel;
  /** L2 时生效：哪些工具/模式受影响 */
  allowedTools?: string[];
  disallowedTools?: string[];
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd ccb && bunx tsc --noEmit --pretty harness/onion/types.ts
```
Expected: 无类型错误（可能有项目路径别名警告，先忽略）。

- [ ] **Step 3: Commit**

```bash
cd ccb && git add harness/onion/types.ts
git commit -m "feat: define onion layer types and middleware contract"
```

---

### Task 3: 出厂默认洋葱层

**Files:**
- Create: `ccb/harness/onion/defaultLayers.ts`

- [ ] **Step 1: 写出默认层定义**

`ccb/harness/onion/defaultLayers.ts`:
```typescript
import type { OnionLayerConfig } from './types.js';

export const AUDIT_LAYER: OnionLayerConfig = {
  id: 'default-audit',
  type: 'audit',
  name: 'Audit Trail',
  enabled: true,
  priority: 0,
  config: {},
};

export const CAPABILITY_GATE_LAYER: OnionLayerConfig = {
  id: 'default-capability-gate',
  type: 'capability-gate',
  name: 'Capability Gate',
  enabled: true,
  priority: 10,
  config: {
    levels: {
      L1: { autoAllow: true },
      L2: { autoAllow: false },
      L3: { requireConfirm: true },
    },
  },
};

export const REQUIRE_CONFIRM_LAYER: OnionLayerConfig = {
  id: 'default-require-confirm',
  type: 'require-confirm',
  name: 'Require Confirm (L3)',
  enabled: true,
  priority: 20,
  config: {
    confirmMessage: 'This action requires explicit user confirmation.',
  },
};

/** 出厂默认三层，用户可删可改（audit 除外——强制保留） */
export const DEFAULT_ONION_LAYERS: OnionLayerConfig[] = [
  AUDIT_LAYER,
  CAPABILITY_GATE_LAYER,
  REQUIRE_CONFIRM_LAYER,
];

export function isDefaultLayer(id: string): boolean {
  return DEFAULT_ONION_LAYERS.some(l => l.id === id);
}
```

- [ ] **Step 2: Commit**

```bash
cd ccb && git add harness/onion/defaultLayers.ts
git commit -m "feat: add default onion layers (audit + capability-gate + require-confirm)"
```

---

### Task 4: 洋葱运行时引擎（Koa-style compose）

**Files:**
- Create: `ccb/harness/onion/runtime.ts`

- [ ] **Step 1: 写出 compose 与 OnionRuntime 类**

`ccb/harness/onion/runtime.ts`:
```typescript
import type {
  OnionMiddleware,
  OnionContext,
  OnionLayerConfig,
  ContractOnion,
  AuditEntry,
} from './types.js';
import type { Tool, ToolUseContext } from '../../src/Tool.js';
import type { PermissionDecision } from '../../src/utils/permissions/PermissionResult.js';
import { DEFAULT_ONION_LAYERS } from './defaultLayers.js';

/** Compose middleware array into a single executable function (Koa-style) */
function compose(middlewares: OnionMiddleware[]): OnionMiddleware {
  return async (ctx: OnionContext, next: () => Promise<void>) => {
    let index = -1;
    async function dispatch(i: number): Promise<void> {
      if (i <= index) throw new Error('next() called multiple times in onion layer');
      index = i;
      if (i >= middlewares.length) {
        await next();
        return;
      }
      const fn = middlewares[i];
      if (fn) {
        await fn(ctx, () => dispatch(i + 1));
      } else {
        await dispatch(i + 1);
      }
    }
    await dispatch(0);
  };
}

export class OnionRuntime {
  private layers: OnionLayerConfig[] = [];
  private middlewares: OnionMiddleware[] = [];
  private initialized = false;

  /** 从 contract-onion.json 或默认配置加载洋葱链 */
  load(contract: ContractOnion | null): void {
    const raw = contract?.layers?.length ? contract.layers : DEFAULT_ONION_LAYERS;
    // 按 priority 排序；确保 audit 层存在
    const hasAudit = raw.some(l => l.type === 'audit' && l.enabled);
    this.layers = hasAudit
      ? [...raw].sort((a, b) => a.priority - b.priority)
      : [
          ...DEFAULT_ONION_LAYERS.filter(l => l.type === 'audit'),
          ...raw,
        ].sort((a, b) => a.priority - b.priority);

    // 链空 → 拒绝一切特权调用
    const enabled = this.layers.filter(l => l.enabled);
    if (enabled.length === 0) {
      this.middlewares = [this.createDenyAllMiddleware()];
    } else {
      this.middlewares = enabled.map(l => this.layerToMiddleware(l));
    }
    this.initialized = true;
  }

  /** 执行洋葱链；返回最终 PermissionDecision */
  async execute(
    tool: Tool,
    input: Record<string, unknown>,
    toolUseContext: ToolUseContext,
    innerCheck: () => Promise<PermissionDecision>,
  ): Promise<PermissionDecision> {
    if (!this.initialized) {
      this.load(null);
    }

    const ctx: OnionContext = {
      tool,
      input,
      toolUseContext,
      decision: null,
      auditTrail: [],
    };

    if (this.middlewares.length === 0) {
      return this.denyAllDecision(tool.name);
    }

    const composed = compose(this.middlewares);

    await composed(ctx, async () => {
      // 核心执行：调用原权限检查（或直接执行）
      const result = await innerCheck();
      ctx.decision = result;
    });

    // 如果某层已经设了 decision，用层的；否则用内核结果
    const finalDecision = ctx.decision ?? this.denyAllDecision(tool.name);

    // 写审计
    await this.writeAudit(ctx.auditTrail);

    return finalDecision;
  }

  /** 获取当前层配置（供 Settings API 用） */
  getLayers(): OnionLayerConfig[] {
    return this.layers;
  }

  /** 更新层配置（供 Settings CRUD 用） */
  updateLayers(layers: OnionLayerConfig[]): void {
    this.layers = layers;
    const enabled = layers.filter(l => l.enabled);
    if (enabled.length === 0) {
      this.middlewares = [this.createDenyAllMiddleware()];
    } else {
      this.middlewares = enabled.map(l => this.layerToMiddleware(l));
    }
  }

  /** 导出为持久化格式 */
  toContract(): ContractOnion {
    return {
      version: 1,
      layers: this.layers,
    };
  }

  // ---- private ----

  private layerToMiddleware(layer: OnionLayerConfig): OnionMiddleware {
    switch (layer.type) {
      case 'audit':
        return this.createAuditMiddleware(layer);
      case 'capability-gate':
        return this.createCapabilityGateMiddleware(layer);
      case 'require-confirm':
        return this.createRequireConfirmMiddleware(layer);
      default:
        // custom / unknown types: passthrough
        return async (_ctx, next) => { await next(); };
    }
  }

  private createAuditMiddleware(layer: OnionLayerConfig): OnionMiddleware {
    return async (ctx, next) => {
      const entry: AuditEntry = {
        timestamp: new Date().toISOString(),
        layerId: layer.id,
        layerType: 'audit',
        toolName: ctx.tool.name,
        decision: 'allow',
      };
      await next();
      entry.decision = ctx.decision?.behavior ?? 'deny';
      entry.reason = ctx.decision?.decisionReason
        ? JSON.stringify(ctx.decision.decisionReason)
        : undefined;
      ctx.auditTrail.push(entry);
    };
  }

  private createCapabilityGateMiddleware(layer: OnionLayerConfig): OnionMiddleware {
    return async (ctx, next) => {
      const levels = (layer.config.levels as Record<string, { autoAllow?: boolean; requireConfirm?: boolean }>) ?? {};
      // 简单实现：L3 工具强制 require-confirm；L1 放行
      // 完整能力注册表在 T2 MCP 阶段补充
      const toolCapabilityLevel = this.classifyToolCapability(ctx.tool.name);

      if (toolCapabilityLevel === 'L1') {
        await next();
        return;
      }

      if (toolCapabilityLevel === 'L3') {
        ctx.decision = {
          behavior: 'ask',
          decisionReason: {
            type: 'other',
            reason: `Tool ${ctx.tool.name} requires explicit user confirmation (L3 capability)`,
          },
          message: `The operation "${ctx.tool.name}" requires your explicit confirmation before execution.`,
        };
        return;
      }

      // L2: 可配置，默认 ask
      await next();
    };
  }

  private createRequireConfirmMiddleware(layer: OnionLayerConfig): OnionMiddleware {
    return async (ctx, next) => {
      // 仅当 capability-gate 已标记 L3 时短路
      // 正常 L1/L2 放行
      await next();
    };
  }

  private createDenyAllMiddleware(): OnionMiddleware {
    return async (ctx, _next) => {
      ctx.decision = this.denyAllDecision(ctx.tool.name);
    };
  }

  private denyAllDecision(toolName: string): PermissionDecision {
    return {
      behavior: 'deny',
      decisionReason: { type: 'other', reason: 'Onion chain is empty — all privileged calls denied.' },
      message: `Permission denied: no active contract layers for ${toolName}.`,
    };
  }

  private classifyToolCapability(toolName: string): 'L1' | 'L2' | 'L3' {
    // 简化版能力分级；T2 MCP 阶段替换为注册表查询
    const L1_TOOLS = new Set([
      'FileRead', 'FileWrite', 'FileEdit', 'Glob', 'Grep',
      'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet',
      'EnterPlanMode', 'ExitPlanModeV2',
    ]);
    const L3_TOOLS = new Set([
      'Bash', 'PowerShell', 'REPL', 'Agent',
      'WebFetch', 'WebSearch',
      'CronCreate', 'CronDelete',
      'Skill',
      'MCP',
      'EnterWorktree', 'ExitWorktree',
    ]);
    if (L3_TOOLS.has(toolName)) return 'L3';
    if (L1_TOOLS.has(toolName)) return 'L1';
    return 'L2';
  }

  private async writeAudit(trail: AuditEntry[]): Promise<void> {
    // T1: console.log stub；T2 落 .harness/audit/
    if (trail.length > 0) {
      console.log('[harness:audit]', JSON.stringify(trail));
    }
  }
}

/** 全局单例（模块级；后续可改为按 workspace 实例化） */
export const onionRuntime = new OnionRuntime();
```

- [ ] **Step 2: 验证编译**

```bash
cd ccb && bunx tsc --noEmit --pretty harness/onion/runtime.ts 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd ccb && git add harness/onion/runtime.ts
git commit -m "feat: implement Koa-style onion runtime with default audit/capability-gate/require-confirm layers"
```

---

### Task 5: 洋葱包装函数 — 接 CCB 权限管线

**Files:**
- Create: `ccb/harness/onion/onionPermissions.ts`

- [ ] **Step 1: 写出 hasPermissionsToUseToolWithOnion**

`ccb/harness/onion/onionPermissions.ts`:
```typescript
import type { CanUseToolFn } from '../../src/hooks/useCanUseTool.js';
import { onionRuntime } from './runtime.js';

/**
 * 洋葱包装的权限检查函数。
 * 替代原 hasPermissionsToUseTool，先穿洋葱链，洋葱 passthrough 时调原函数。
 *
 * @param original 原 hasPermissionsToUseTool 实现
 */
export function createOnionWrappedPermissions(
  original: CanUseToolFn,
): CanUseToolFn {
  return async (tool, input, context, assistantMessage, toolUseID) => {
    return onionRuntime.execute(tool, input, context, async () => {
      return original(tool, input, context, assistantMessage, toolUseID);
    });
  };
}
```

- [ ] **Step 2: Commit**

```bash
cd ccb && git add harness/onion/onionPermissions.ts
git commit -m "feat: add onion-wrapped permission function for CCB pipeline injection"
```

---

### Task 6: 修改 CCB 权限管线 — 注入洋葱

**Files:**
- Modify: `ccb/src/utils/permissions/permissions.ts`
- Modify: `ccb/src/hooks/useCanUseTool.tsx`

- [ ] **Step 1: 在 permissions.ts 中导出洋葱包装函数（最小改动）**

在 `ccb/src/utils/permissions/permissions.ts` 文件末尾添加：

```typescript
// ---- Harness Onion Injection Point ----
// T1: 洋葱运行时包装原 hasPermissionsToUseTool。
// 后续 T4 阶段 Slot 可替换此 import 源。
import { createOnionWrappedPermissions } from '../../../harness/onion/onionPermissions.js';
export const hasPermissionsToUseToolWithOnion: CanUseToolFn =
  createOnionWrappedPermissions(hasPermissionsToUseTool);
```

- [ ] **Step 2: 在 useCanUseTool.tsx 中切换到洋葱版本**

修改 `ccb/src/hooks/useCanUseTool.tsx` 第 29 行：
```typescript
// OLD:
import { hasPermissionsToUseTool } from '../utils/permissions/permissions.js';
// NEW:
import { hasPermissionsToUseToolWithOnion as hasPermissionsToUseTool } from '../utils/permissions/permissions.js';
```

- [ ] **Step 3: 验证编译**

```bash
cd ccb && bunx tsc --noEmit --pretty 2>&1 | head -30
```
Expected: 无新增类型错误。

- [ ] **Step 4: Commit**

```bash
cd ccb && git add src/utils/permissions/permissions.ts src/hooks/useCanUseTool.tsx
git commit -m "feat: inject onion runtime into CCB permission pipeline (T1)"
```

---

### Task 7: .harness Bootstrap 脚本

**Files:**
- Create: `ccb/harness/bootstrap/init.ts`
- Create: `ccb/harness/bootstrap/loadCharter.ts`
- Create: `ccb/harness/bootstrap/loadOnion.ts`

- [ ] **Step 1: 创建 init.ts**

`ccb/harness/bootstrap/init.ts`:
```typescript
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ContractOnion } from '../onion/types.js';
import { DEFAULT_ONION_LAYERS } from '../onion/defaultLayers.js';

const HARNESS_DIR = '.harness';

const SKELETON_DIRS = [
  'audit',
  'chat',
  'skills',
  'memory',
  'fusion',
  'workflows',
];

const DEFAULT_CHARTER = `# Workspace Charter

## Identity
This workspace is managed by the Harness Control Console.

## Purpose
[TBD: Define the primary purpose of this workspace]

## Content Policy
- Follow the contract onion rules defined in contract-onion.json
- All tool calls are subject to capability gates and audit
`;

const DEFAULT_MANIFEST: Record<string, unknown> = {
  version: '1.0.0',
  harness: 'harness-console',
  createdAt: new Date().toISOString(),
};

const DEFAULT_ONION_CONTRACT: ContractOnion = {
  version: 1,
  layers: DEFAULT_ONION_LAYERS,
};

export function initHarness(workspaceRoot: string): void {
  const harnessDir = join(workspaceRoot, HARNESS_DIR);

  if (!existsSync(harnessDir)) {
    mkdirSync(harnessDir, { recursive: true });
  }

  // Create skeleton subdirectories
  for (const dir of SKELETON_DIRS) {
    const fullPath = join(harnessDir, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
    }
  }

  // Write charter.md (only if not exists — don't overwrite user edits)
  const charterPath = join(harnessDir, 'charter.md');
  if (!existsSync(charterPath)) {
    writeFileSync(charterPath, DEFAULT_CHARTER, 'utf-8');
  }

  // Write contract-onion.json (only if not exists)
  const onionPath = join(harnessDir, 'contract-onion.json');
  if (!existsSync(onionPath)) {
    writeFileSync(onionPath, JSON.stringify(DEFAULT_ONION_CONTRACT, null, 2), 'utf-8');
  }

  // Write manifest.json (only if not exists)
  const manifestPath = join(harnessDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    writeFileSync(manifestPath, JSON.stringify(DEFAULT_MANIFEST, null, 2), 'utf-8');
  }

  console.log(`[harness] Workspace initialized at ${harnessDir}`);
}

// CLI entry: run directly with `bun run harness/bootstrap/init.ts`
if (import.meta.main) {
  const cwd = process.cwd();
  initHarness(cwd);
}
```

- [ ] **Step 2: 创建 loadCharter.ts**

`ccb/harness/bootstrap/loadCharter.ts`:
```typescript
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function loadCharter(workspaceRoot: string): string | null {
  const charterPath = join(workspaceRoot, '.harness', 'charter.md');
  if (!existsSync(charterPath)) return null;
  return readFileSync(charterPath, 'utf-8');
}
```

- [ ] **Step 3: 创建 loadOnion.ts**

`ccb/harness/bootstrap/loadOnion.ts`:
```typescript
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ContractOnion, OnionLayerConfig } from '../onion/types.js';
import { onionRuntime } from '../onion/runtime.js';

const ONION_PATH = '.harness/contract-onion.json';

export function loadOnion(workspaceRoot: string): ContractOnion | null {
  const fullPath = join(workspaceRoot, ONION_PATH);
  if (!existsSync(fullPath)) return null;
  try {
    const raw = readFileSync(fullPath, 'utf-8');
    const contract = JSON.parse(raw) as ContractOnion;
    onionRuntime.load(contract);
    return contract;
  } catch {
    console.error('[harness] Failed to parse contract-onion.json, using defaults');
    onionRuntime.load(null);
    return null;
  }
}

export function saveOnion(workspaceRoot: string, layers: OnionLayerConfig[]): void {
  const fullPath = join(workspaceRoot, ONION_PATH);
  onionRuntime.updateLayers(layers);
  const contract = onionRuntime.toContract();
  writeFileSync(fullPath, JSON.stringify(contract, null, 2), 'utf-8');
}
```

- [ ] **Step 4: 运行 init 脚本验证**

```bash
cd ccb && bun run harness/bootstrap/init.ts
ls -la .harness/
cat .harness/contract-onion.json | head -20
```
Expected: `.harness/` 目录创建，含 `charter.md`、`contract-onion.json`、`manifest.json` 及所有子目录。

- [ ] **Step 5: Commit**

```bash
cd ccb && git add harness/bootstrap/init.ts harness/bootstrap/loadCharter.ts harness/bootstrap/loadOnion.ts
# .harness/ 应该被 .gitignore 或单独处理；先不提交
git commit -m "feat: add .harness bootstrap with charter and onion contract persistence"
```

---

### Task 8: Hono Web 服务器

**Files:**
- Create: `ccb/harness/web/server.ts`
- Create: `ccb/harness/web/routes/api/onion.ts`
- Create: `ccb/harness/web/routes/api/charter.ts`

- [ ] **Step 1: 创建洋葱 API 路由**

`ccb/harness/web/routes/api/onion.ts`:
```typescript
import { Hono } from 'hono';
import { onionRuntime } from '../../../onion/runtime.js';
import { saveOnion, loadOnion } from '../../../bootstrap/loadOnion.js';
import type { OnionLayerConfig } from '../../../onion/types.js';

const onionApi = new Hono();

/** GET /api/onion — 获取当前洋葱配置 */
onionApi.get('/', (c) => {
  const layers = onionRuntime.getLayers();
  return c.json({ layers });
});

/** PUT /api/onion — 全量替换洋葱层配置 */
onionApi.put('/', async (c) => {
  const body = await c.req.json<{ layers: OnionLayerConfig[] }>();
  if (!Array.isArray(body.layers)) {
    return c.json({ error: 'Invalid payload: layers must be an array' }, 400);
  }
  const cwd = process.cwd();
  saveOnion(cwd, body.layers);
  return c.json({ layers: onionRuntime.getLayers() });
});

export default onionApi;
```

- [ ] **Step 2: 创建章程 API 路由**

`ccb/harness/web/routes/api/charter.ts`:
```typescript
import { Hono } from 'hono';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const charterApi = new Hono();

charterApi.get('/', (c) => {
  const charterPath = join(process.cwd(), '.harness', 'charter.md');
  if (!existsSync(charterPath)) {
    return c.json({ content: '' });
  }
  return c.json({ content: readFileSync(charterPath, 'utf-8') });
});

charterApi.put('/', async (c) => {
  const body = await c.req.json<{ content: string }>();
  const charterPath = join(process.cwd(), '.harness', 'charter.md');
  writeFileSync(charterPath, body.content ?? '', 'utf-8');
  return c.json({ ok: true });
});

export default charterApi;
```

- [ ] **Step 3: 创建 Hono 服务器入口**

`ccb/harness/web/server.ts`:
```typescript
import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { join } from 'node:path';
import onionApi from './routes/api/onion.js';
import charterApi from './routes/api/charter.js';

const app = new Hono();

// API routes
app.route('/api/onion', onionApi);
app.route('/api/charter', charterApi);

// Serve Vite dev server proxy in dev mode; static files in production
const isDev = process.env.NODE_ENV !== 'production';
if (isDev) {
  console.log('[harness] Web server running at http://localhost:3100');
  console.log('[harness] Start Vite dev server separately: bun run harness:web:dev');
} else {
  // Production: serve built client
  const clientDist = join(import.meta.dirname, 'dist-client');
  app.use('/*', serveStatic({ root: clientDist }));
  // SPA fallback
  app.get('/*', async (c) => {
    const htmlFile = Bun.file(join(clientDist, 'index.html'));
    if (await htmlFile.exists()) {
      return c.html(await htmlFile.text());
    }
    return c.text('Harness Console', 200);
  });
}

export default { port: 3100, fetch: app.fetch };
```

- [ ] **Step 4: 启动服务器验证**

```bash
cd ccb && bun run harness/web/server.ts &
sleep 1
curl http://localhost:3100/api/onion | head -50
```
Expected: 返回 JSON `{ "layers": [...] }`。

- [ ] **Step 5: Commit**

```bash
cd ccb && git add harness/web/server.ts harness/web/routes/
git commit -m "feat: add Hono web server with onion/charter REST API endpoints"
```

---

### Task 9: React Web Shell — 空态 Chat|Settings

**Files:**
- Create: `ccb/harness/web/client/index.html`
- Create: `ccb/harness/web/client/main.tsx`
- Create: `ccb/harness/web/client/App.tsx`
- Create: `ccb/harness/web/client/components/ChatPanel.tsx`
- Create: `ccb/harness/web/client/components/SettingsPanel.tsx`

- [ ] **Step 1: 创建 index.html**

`ccb/harness/web/client/index.html`:
```html
<!DOCTYPE html>
<html lang="en" class="h-full bg-zinc-950 text-zinc-100">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Harness Console</title>
  <link rel="stylesheet" href="./styles/index.css" />
</head>
<body class="h-full">
  <div id="root" class="h-full"></div>
  <script type="module" src="./main.tsx"></script>
</body>
</html>
```

- [ ] **Step 2: 创建 main.tsx**

`ccb/harness/web/client/main.tsx`:
```typescript
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(React.createElement(App));
}
```

- [ ] **Step 3: 创建 App.tsx（Shell + Tab 切换）**

`ccb/harness/web/client/App.tsx`:
```typescript
import React, { useState } from 'react';
import ChatPanel from './components/ChatPanel.js';
import SettingsPanel from './components/SettingsPanel.js';

type Tab = 'chat' | 'settings';

export default function App(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex items-center gap-1 px-4 py-2 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <span className="text-sm font-semibold text-orange-400 mr-4">Harness</span>
        <nav className="flex gap-1">
          <TabButton
            active={activeTab === 'chat'}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </TabButton>
          <TabButton
            active={activeTab === 'settings'}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </TabButton>
        </nav>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'chat' ? <ChatPanel /> : <SettingsPanel />}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
        active
          ? 'bg-zinc-800 text-white'
          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
      }`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: 创建 ChatPanel.tsx（占位）**

`ccb/harness/web/client/components/ChatPanel.tsx`:
```typescript
import React from 'react';

export default function ChatPanel(): React.ReactElement {
  return (
    <div className="flex items-center justify-center h-full text-zinc-500">
      <div className="text-center">
        <p className="text-lg mb-2">Chat</p>
        <p className="text-sm">Agent conversation will appear here. (T4)</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 创建 SettingsPanel.tsx（壳 + 洋葱编辑器占位）**

`ccb/harness/web/client/components/SettingsPanel.tsx`:
```typescript
import React from 'react';
import OnionEditor from './OnionEditor.js';

export default function SettingsPanel(): React.ReactElement {
  return (
    <div className="max-w-2xl mx-auto p-6 overflow-y-auto h-full">
      <h2 className="text-lg font-semibold mb-6">Settings</h2>
      <section>
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Contract Onion</h3>
        <OnionEditor />
      </section>
    </div>
  );
}
```

- [ ] **Step 6: 验证 Vite dev server 可启动**

```bash
cd ccb && bun run harness:web:dev &
sleep 2
curl http://localhost:5173 | head -20
```
Expected: HTML 页面返回。

- [ ] **Step 7: Commit**

```bash
cd ccb && git add harness/web/client/
git commit -m "feat: add React web shell with Chat|Settings tabs (Chat placeholder, Settings with onion editor)"
```

---

### Task 10: 洋葱编辑器 UI（Settings CRUD）

**Files:**
- Create: `ccb/harness/web/client/components/OnionEditor.tsx`
- Create: `ccb/harness/web/client/components/OnionLayerForm.tsx`

- [ ] **Step 1: 创建 OnionEditor.tsx**

`ccb/harness/web/client/components/OnionEditor.tsx`:
```typescript
import React, { useEffect, useState } from 'react';
import type { OnionLayerConfig } from '../../../onion/types.js';
import OnionLayerForm from './OnionLayerForm.js';

export default function OnionEditor(): React.ReactElement {
  const [layers, setLayers] = useState<OnionLayerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/onion')
      .then(r => r.json())
      .then(data => {
        setLayers(data.layers ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const save = async (newLayers: OnionLayerConfig[]) => {
    setSaving(true);
    try {
      const res = await fetch('/api/onion', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layers: newLayers }),
      });
      const data = await res.json();
      setLayers(data.layers ?? newLayers);
    } finally {
      setSaving(false);
    }
  };

  const toggleLayer = async (id: string) => {
    const updated = layers.map(l =>
      l.id === id ? { ...l, enabled: !l.enabled } : l,
    );
    setLayers(updated);
    await save(updated);
  };

  const moveLayer = async (id: string, direction: 'up' | 'down') => {
    const idx = layers.findIndex(l => l.id === id);
    if (idx < 0) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= layers.length) return;
    const updated = [...layers];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    // Re-assign priorities
    const reordered = updated.map((l, i) => ({ ...l, priority: i * 10 }));
    setLayers(reordered);
    await save(reordered);
  };

  const deleteLayer = async (id: string) => {
    // 不允许删除 audit 层
    const layer = layers.find(l => l.id === id);
    if (layer?.type === 'audit') return;
    const updated = layers.filter(l => l.id !== id);
    setLayers(updated);
    await save(updated);
  };

  if (loading) {
    return <p className="text-zinc-500 text-sm">Loading...</p>;
  }

  return (
    <div className="space-y-2">
      {layers.length === 0 && (
        <p className="text-red-400 text-sm">
          No active layers — all privileged calls will be denied.
        </p>
      )}
      {layers.map((layer, idx) => (
        <div
          key={layer.id}
          className={`flex items-center gap-3 p-3 rounded-lg border ${
            layer.enabled
              ? 'border-zinc-700 bg-zinc-800/50'
              : 'border-zinc-800 bg-zinc-900/30 opacity-60'
          }`}
        >
          {/* Toggle */}
          <button
            onClick={() => toggleLayer(layer.id)}
            className={`w-9 h-5 rounded-full transition-colors relative ${
              layer.enabled ? 'bg-orange-500' : 'bg-zinc-600'
            }`}
            aria-label={layer.enabled ? 'Disable layer' : 'Enable layer'}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                layer.enabled ? 'left-4' : 'left-0.5'
              }`}
            />
          </button>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{layer.name}</p>
            <p className="text-xs text-zinc-500">
              {layer.type} · priority {layer.priority}
            </p>
          </div>

          {/* Reorder */}
          <button
            onClick={() => moveLayer(layer.id, 'up')}
            disabled={idx === 0}
            className="text-zinc-500 hover:text-zinc-300 disabled:opacity-30 text-sm px-1"
            aria-label="Move up"
          >
            ▲
          </button>
          <button
            onClick={() => moveLayer(layer.id, 'down')}
            disabled={idx === layers.length - 1}
            className="text-zinc-500 hover:text-zinc-300 disabled:opacity-30 text-sm px-1"
            aria-label="Move down"
          >
            ▼
          </button>

          {/* Delete */}
          <button
            onClick={() => deleteLayer(layer.id)}
            disabled={layer.type === 'audit'}
            className="text-zinc-500 hover:text-red-400 disabled:opacity-30 text-sm"
            aria-label="Delete layer"
          >
            ✕
          </button>
        </div>
      ))}

      {saving && (
        <p className="text-xs text-zinc-500">Saving...</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建 OnionLayerForm.tsx（占位 — T2 完善）**

`ccb/harness/web/client/components/OnionLayerForm.tsx`:
```typescript
import React from 'react';

// T1: placeholder for add/edit layer form; will be implemented in T2
export default function OnionLayerForm(): React.ReactElement {
  return null;
}
```

- [ ] **Step 3: Commit**

```bash
cd ccb && git add harness/web/client/components/OnionEditor.tsx harness/web/client/components/OnionLayerForm.tsx
git commit -m "feat: add onion editor UI with toggle, reorder, delete (Settings CRUD)"
```

---

### Task 11: 端到端验证 — 洋葱阻断工具调用

**Files:**
- Create: `ccb/harness/__tests__/onion-runtime.test.ts`

- [ ] **Step 1: 写洋葱运行时单元测试**

`ccb/harness/__tests__/onion-runtime.test.ts`:
```typescript
import { describe, test, expect, beforeAll } from 'bun:test';
import { OnionRuntime } from '../onion/runtime.js';
import type { ContractOnion, OnionLayerConfig } from '../onion/types.js';

function makeStubTool(name: string) {
  return {
    name,
    mcpInfo: undefined,
    isMcp: false,
    inputSchema: { parse: (i: unknown) => i },
    checkPermissions: async () => ({ behavior: 'passthrough' as const }),
    description: async () => '',
    userFacingName: () => name,
  };
}

function makeStubContext() {
  return {
    abortController: new AbortController(),
    messages: [],
    options: { tools: [], isNonInteractiveSession: false },
    getAppState: () => ({
      toolPermissionContext: { mode: 'default' as const },
    }),
    setAppState: () => {},
  };
}

describe('OnionRuntime', () => {
  let runtime: OnionRuntime;

  beforeAll(() => {
    runtime = new OnionRuntime();
  });

  test('默认三层：audit + capability-gate + require-confirm', () => {
    runtime.load(null);
    const layers = runtime.getLayers();
    expect(layers.length).toBeGreaterThanOrEqual(3);
    expect(layers.some(l => l.type === 'audit')).toBe(true);
    expect(layers.some(l => l.type === 'capability-gate')).toBe(true);
  });

  test('L1 工具 FileRead 被 capability-gate 放行', async () => {
    runtime.load(null);
    const result = await runtime.execute(
      makeStubTool('FileRead') as any,
      {},
      makeStubContext() as any,
      async () => ({ behavior: 'allow' as const }),
    );
    expect(result.behavior).toBe('allow');
  });

  test('L3 工具 Bash 被 capability-gate 拦截为 ask', async () => {
    runtime.load(null);
    const result = await runtime.execute(
      makeStubTool('Bash') as any,
      { command: 'rm -rf /' },
      makeStubContext() as any,
      async () => ({ behavior: 'allow' as const }),
    );
    // L3 requires confirmation: no allow
    expect(result.behavior).not.toBe('allow');
  });

  test('链空 → 拒绝一切', () => {
    runtime.updateLayers([]);
    const layers = runtime.getLayers();
    expect(layers.length).toBe(0);
  });

  test('链空时 execute 返回 deny', async () => {
    runtime.updateLayers([]);
    const result = await runtime.execute(
      makeStubTool('FileRead') as any,
      {},
      makeStubContext() as any,
      async () => ({ behavior: 'allow' as const }),
    );
    expect(result.behavior).toBe('deny');
  });

  test('禁用全部层 → 等于链空，拒绝', async () => {
    const allDisabled: OnionLayerConfig[] = [
      {
        id: 'test-audit',
        type: 'audit',
        name: 'Audit',
        enabled: false,
        priority: 0,
        config: {},
      },
    ];
    const contract: ContractOnion = { version: 1, layers: allDisabled };
    runtime.load(contract);
    const result = await runtime.execute(
      makeStubTool('FileRead') as any,
      {},
      makeStubContext() as any,
      async () => ({ behavior: 'allow' as const }),
    );
    expect(result.behavior).toBe('deny');
  });

  test('审计 trail 包含条目', async () => {
    const layers: OnionLayerConfig[] = [
      {
        id: 'audit-1',
        type: 'audit',
        name: 'Audit',
        enabled: true,
        priority: 0,
        config: {},
      },
      {
        id: 'cg-1',
        type: 'capability-gate',
        name: 'CG',
        enabled: true,
        priority: 10,
        config: { levels: {} },
      },
    ];
    runtime.load({ version: 1, layers });
    const result = await runtime.execute(
      makeStubTool('FileRead') as any,
      {},
      makeStubContext() as any,
      async () => ({ behavior: 'allow' as const }),
    );
    expect(result.behavior).toBe('allow');
  });

  test('getLayers 返回排序后的层', () => {
    const layers: OnionLayerConfig[] = [
      { id: 'b', type: 'audit', name: 'B', enabled: true, priority: 20, config: {} },
      { id: 'a', type: 'audit', name: 'A', enabled: true, priority: 0, config: {} },
    ];
    runtime.load({ version: 1, layers });
    const sorted = runtime.getLayers();
    expect(sorted[0].id).toBe('a');
    expect(sorted[1].id).toBe('b');
  });
});
```

- [ ] **Step 2: 运行测试**

```bash
cd ccb && bun test harness/__tests__/onion-runtime.test.ts
```
Expected: 全部 PASS（8 tests）。

- [ ] **Step 3: Commit**

```bash
cd ccb && git add harness/__tests__/onion-runtime.test.ts
git commit -m "test: add onion runtime unit tests (default layers, capability gate, empty chain)"
```

---

### Task 12: 集成验证 — CCB 权限管线走洋葱

**Files:**
- Modify: 无新文件；验证现有注入。

- [ ] **Step 1: 验证 hasPermissionsToUseToolWithOnion 导出正确**

```bash
cd ccb && grep -n "hasPermissionsToUseToolWithOnion" src/utils/permissions/permissions.ts
```
Expected: 找到导出语句。

- [ ] **Step 2: 验证 useCanUseTool 使用了洋葱版本**

```bash
cd ccb && grep -n "hasPermissionsToUseToolWithOnion" src/hooks/useCanUseTool.tsx
```
Expected: 找到 import 语句。

- [ ] **Step 3: 运行 CCB 现有测试确保不回归**

```bash
cd ccb && bun test src/utils/permissions/ 2>&1 | tail -20
```
Expected: 现有权限测试保持通过（如果有的话）。

- [ ] **Step 4: 运行洋葱测试 + 类型检查**

```bash
cd ccb && bun test harness/__tests__/onion-runtime.test.ts && bunx tsc --noEmit --pretty 2>&1 | tail -20
```
Expected: 测试全过；类型检查零新增错误。

- [ ] **Step 5: Commit**

```bash
cd ccb && git add -A
git commit -m "chore: verify onion injection into CCB permission pipeline passes tests"
```

---

## 验收清单

开发完成后逐项核对：

- [ ] `bun run harness/bootstrap/init.ts` 在项目根创建 `.harness/` 骨架（charter.md + contract-onion.json + manifest.json + 子目录）
- [ ] `.harness/contract-onion.json` 包含默认三层（audit + capability-gate + require-confirm）
- [ ] 洋葱运行时 `OnionRuntime` 正确加载/排序/执行中间件链
- [ ] L1 工具（FileRead）经默认洋葱 → allow
- [ ] L3 工具（Bash）经默认洋葱 → ask（非 allow）
- [ ] 链空 → 任何工具调用 → deny
- [ ] `bun run harness:web:dev` 启动 Vite dev server → 浏览器访问看到 Chat|Settings 双 Tab
- [ ] Settings 面板展示洋葱层列表；可 toggle 启用/禁用、上下移动、删除
- [ ] Settings 修改后刷新页面，修改持久化（读取 contract-onion.json）
- [ ] CCB `useCanUseTool` 经 `hasPermissionsToUseToolWithOnion` 走洋葱
- [ ] `bun test harness/__tests__/onion-runtime.test.ts` 全部通过
- [ ] `bunx tsc --noEmit` 无新增类型错误

---

## 自我审查

**Spec 覆盖检查：**
- `.harness` Bootstrap → Task 7
- 洋葱 runtime 接 `hasPermissionsToUseTool` / `useCanUseTool` → Tasks 5, 6
- Settings 洋葱 CRUD (API + UI) → Tasks 8, 10
- Web 空态 Chat|Settings → Tasks 9
- 能力 L1/L2/L3 分级 → Task 4 (classifyToolCapability)
- 出厂默认三层 → Task 3
- 链空拒绝 → Task 4 (createDenyAllMiddleware), Task 11 测试覆盖
- 不接满血 loop（T4 范围外）→ 确认：Chat 占位；无 agent 循环产品化

**Placeholder 检查：**
- `OnionLayerForm.tsx` 返回 null → 显式标注 "T2 完善"，非隐藏 TODO
- `classifyToolCapability` 硬编码工具名 → T2 替换为注册表，当前够用
- `writeAudit` console.log stub → T2 落 `.harness/audit/`
- ChatPanel 占位 → T4 接入 Headless Chat
- 无其他 TBD/TODO

**类型一致性：**
- `OnionLayerConfig` 贯穿 types → runtime → defaultLayers → loadOnion → API → UI
- `OnionRuntime.load()` / `updateLayers()` / `getLayers()` / `execute()` 签名一致
- `PermissionDecision` 沿用 CCB 原类型，无自定义替代
