# Skill Factory — 约定驱动 Skill 生产与评测闭环

**日期：** 2026-07-18  
**状态：** Draft（待用户审阅 spec 文件）  
**产品仓名：** `skill-factory`（完整产品 submodule）  
**资产仓名：** `skill-assets`（嵌套 submodule，Skill 唯一产出面）  
**宿主：** `harness-console`（仅 MCP Chat 控制面 + 可选 iframe 看板）  
**范围：** 双仓骨架、MCP 半自动契约、Skill 目录约定、离线双引擎评测、线上仓消费契约  
**非范围：** 线上仓实现与上线/灰度门禁；微前端；MCP 自动 merge 入库

## 背景与目标

电商高价率运营是高频、标准化、强流程、强合规的小二工作（播报、跟进、同款校验、分发、日报等）。传统 LLM Agent 难测、难回归、规则迭代易牵一片。

**目标：** 搭建「约定驱动 + AI 编排」的 Skill 自动化生产与评测闭环：

- 业务流程标准化为固定 Workflow Skill（流程锁死，模型无权自由编排）
- 经 Claude Code **离线**流水线生成 Skill / 用例 / Rubric
- LLM Judge 二元（0/1）评测，质量可量化、可复跑
- 「开发 → 评测 → 标注 → 迭代」半自动飞轮；入库与上线由人工/外仓决定

## 架构结论（收口）

| 侧 | 职责 | 模型 |
|----|------|------|
| **研发工程侧**（`skill-factory`） | 生成 Skill、评测、打分、优化建议；MCP 暴露给中控 | Claude **仅离线** |
| **Skill 资产侧**（`skill-assets`） | 约定资产唯一事实源；staging / published 分离 | 无运行时模型 |
| **线上业务侧**（**另仓**） | 固定 Workflow 引擎 + 业务 LLM；submodule 消费 `published/`；**自行决定是否上线** | 业务自研推理模型，**无 Claude** |
| **宿主**（`harness-console`） | MCP Chat 半自动控制；可选 iframe 嵌评测看板 | 不承载高价率业务实现 |

**挂载选择：** 控制走 MCP Chat；看板用独立 URL / iframe。不做微前端起步。

## 仓拓扑

```
harness-console/                      # 宿主
  ccb/                                # 已有无头 Agent
  skill-factory/                      # NEW submodule：离线生产 + 评测 + MCP
    offline/
      pinchbench-eval/                # 跑批执行引擎
      auto-evaluation/                # 评测大脑（用例/Rubric/Judge/归因）
    mcp/                              # 中控调用的 MCP Server
    skill-assets/                     # NEW nested submodule
      _meta/
      staging/
      published/

<other-online-repo>/                  # 另仓（本 design 不实现）
  skill-assets/                       # submodule → 同一 skill-assets（只读 published/）
```

### 硬边界

- 中控 **不实现** 高价率业务能力；只通过 MCP 驱动 `skill-factory`
- 线上 Loop 与离线 Loop **模型隔离**
- `skill-factory` **不包含**生产线上引擎；最多保留本地/仿真 runner 供评测跑批
- 上线/发布门禁 **不在** `skill-factory` / 中控范围
- Skill 变更经评测与人工 Review 后进入 `published/`；线上仓只消费 `published/`

## MCP 契约（半自动）

中控 Chat 经洋葱契约调用 `skill-factory` MCP Server。

### 只读

| Tool | 说明 |
|------|------|
| `skill.list` / `skill.get` | 列/读 Skill 元数据与 SKILL.md 摘要 |
| `eval.report.get` / `eval.diff` | 评测报告、版本对比 |
| `eval.low_score.cluster` | 低分聚类摘要 |

### 半自动写（结果进 staging，不直接改金标）

| Tool | 说明 |
|------|------|
| `skill.generate` | 按业务描述生成 Skill 全套草稿 → `staging/` |
| `eval.cases.generate` | 基于真实业务数据生成用例草稿 |
| `rubric.generate` | 生成**专项** Rubric 草稿（通用 14 维只读，禁止此工具改） |
| `eval.run` | 触发 pinchbench 跑批 |
| `skill.optimize.suggest` | 按低分产出优化建议（文本/patch 草稿） |

### 明确不做

- 无 `skill.publish`、无上线门禁工具
- 无直接修改 `reference_data` / 通用 Rubric 的工具
- 「入库」= 人工 Review 后 staging → `published/`（PR/人工合并）；MCP 不自动 merge

### 失败与审计

- 所有写类工具写审计日志（主体、时间、参数、产出路径）
- 触及冻结路径 → 硬拒绝，错误码 `FROZEN_PATH`

## `skill-assets` 目录约定

```
skill-assets/
  _meta/
    common_rubric.json          # 14 通用维：冻结，禁止 AI 改
    schema/                     # 入参/出参/步骤 Schema
  staging/                      # MCP 生成草稿（可被 AI 写）
  published/                    # 人工 Review 入库；线上仓只应消费此处
    <skill-id>/
      SKILL.md                  # 唯一事实源：触发词、步骤、约束引用
      constraint.md             # 合规红线
      scripts/                  # 工具调用与业务脚本
      rubric_config.json        # 专项 Rubric
      cases/
        reference/              # 金标：冻结，禁止 AI 改
        generated/              # 生成用例草稿 → Review 后可升格
      CHANGELOG.md              # 版本与评测摘要指针
```

### 资产覆盖（清单级）

- 16 个高价率运营 Skill（价格播报、跟进、同款校验、数据分发、高价率查询、日报产出等）
- 14 个通用评测维度 + 各 Skill 专项维度
- 216+ 标准化评测用例（金标与生成分目录）

## 线上仓消费契约

线上仓以 submodule 锁定 `skill-assets` 的 **git tag / commit**，且只读 `published/`：

| 线上引擎必须遵守 | 说明 |
|------------------|------|
| 按 `SKILL.md` 预定义步骤执行 | 禁止跳步、自创参数、调用未授权工具 |
| 入参/出参走 `_meta/schema` | 强 Schema；业务 LLM 只做抽参与话术填充 |
| `severe_violation` | 违规即失败/低分兜底（与评测语义对齐） |
| 不读 `staging/` | 未入库资产对线上不可见 |

`skill-factory` 评测跑批使用同一套 `published/`（或 staging 试跑）+ 本地仿真 runner，保证「评的就是线上将拉的资产形态」。

**上线是否采用某 tag：仅由线上仓自身流程决定。**

## 离线双引擎评测

### 分工

| 组件 | 职责 | 模型 |
|------|------|------|
| **pinchbench-eval** | 跑批：加载 Skill → 执行用例 → 原始轨迹/结果 | 业务 LLM / 仿真 runner（无 Claude） |
| **auto-evaluation** | 生成用例与专项 Rubric 草稿、LLM Judge、低分聚类、优化建议 | 仅 Claude（离线） |

评测数据源与执行环境强制隔离：Judge 不写执行沙箱；执行沙箱不持有 Judge 密钥。

### 主路径

```
业务描述
  → skill.generate / cases.generate / rubric.generate（→ staging）
  → 人工 Review → 合并入 published/（金标、通用 Rubric 不动）
  → eval.run（pinchbench）
  → Judge（14 通用 + 专项；每维仅 0/1）
  → severe_violation → 强制锁低总分
  → 报告 + 低分聚类 + optimize.suggest（草稿）
  → 人工采纳后再改资产（禁止尺子偷偷自变）
```

### 评分硬规则

- **二元 0/1**：无中间分
- **严重违规兜底**：核心流程/参数错误直接压总分
- **基准冻结**：`cases/reference/`、`_meta/common_rubric.json` 禁止 AI 工具修改
- **Rubric 半自动**：专项可出草稿；通用维变更必须人工 PR，并回归对比旧报告

### Roadmap 接口预留（本阶段不承诺打通）

| 瓶颈 | 本阶段 | 后续 |
|------|--------|------|
| 线上 Case 不回流 | 预留 `cases.ingest` 与目录约定 | 接线上仓日志 |
| 优化建议准确率低 | `optimize.suggest` 仅草稿 + 四类归因标签（Skill / 脚本 / rubric / 用例） | 记忆与 Diff |
| 无变更记忆 | `CHANGELOG` + 评测报告按版本落盘 | 全链路 Diff |
| Rubric 自更新悖论 | 通用维禁止 AI 改；专项变更需人工 | 可控半自动回归 |

## 产品硬规则（汇总）

1. **模型隔离：** 线上业务推理绝不使用 Claude；Claude 仅离线工程流水线  
2. **流程固定：** Skill 执行为固定 Workflow；模型无权自由编排  
3. **基准冻结：** 金标 `reference_data`、通用 Rubric 禁止 AI 自动修改  
4. **二元打分：** 评测维度仅 0/1  
5. **严重违规兜底：** 核心错误锁低总分  
6. **分层解耦：** 评测数据源与执行环境隔离  
7. **上线外置：** 是否上线由另仓决定；本系统只生产与评测  

## 错误处理

| 场景 | 行为 |
|------|------|
| MCP 写冻结路径 | 硬拒绝 + `FROZEN_PATH` |
| 跑批 Skill/脚本崩溃 | 用例 `exec_error`；不计 Judge 高分；入低分聚类 |
| Judge 超时/同维 0/1 分歧 | 重试上限后标 `judge_unstable`；人工复核；不自动改 Rubric |
| staging 被线上误挂 | 契约：线上只读 `published/`；tag 建议仅打在 published 变更 |

## 测试策略

- **契约测试：** MCP tool schema、冻结路径拒绝、staging/published 分离  
- **资产校验：** Skill 目录结构、`SKILL.md` 必填字段、Schema 合法  
- **评测回归：** 固定金标子集 + 固定 Judge prompt 版本 → 分数快照可复跑  
- **不测：** 线上仓发布/灰度；真实小二生产流量（仅预留 ingest）

## 非目标

- 线上仓 Workflow 引擎实现与上线门禁  
- 微前端深度整合  
- MCP 自动 merge 入库  
- 一次打通线上日志回流、高准确率自动改 Skill、Rubric 全自动进化  

## 成功标准

- 可建双仓 `skill-factory`、`skill-assets`，中控 submodule 挂载可文档化复现  
- Chat 能半自动：生成草稿、跑批、看报告、拿优化建议；无法碰金标  
- 评测：0/1 + severe 兜底 + 版本报告可复跑  
- 线上另仓可只读 submodule `published/` 并自行决定上线（本仓不参与）

## 实现顺序建议（供 writing-plans）

1. 新建空仓 `skill-assets`（目录骨架 + `_meta` 冻结文件占位）  
2. 新建空仓 `skill-factory`（offline 骨架 + nested submodule + MCP stub）  
3. 中控 `git submodule add` + 文档；MCP 只读工具  
4. staging 生成类工具 + 冻结路径拒绝测试  
5. pinchbench 跑批最小路径 + Judge 0/1 最小路径  
6. 报告 / diff / suggest；可选 iframe 看板 URL  

---

## 附录：原始 PRD 能力对照

| PRD 要点 | 本设计落点 |
|----------|------------|
| 线上固定 Workflow + 业务 LLM | **外置线上仓**消费 `skill-assets/published/` |
| 离线 Claude 编排 | `skill-factory/offline` + MCP |
| Skill 标准目录 | `skill-assets` 约定 |
| pinchbench + auto-evaluation | `offline/` 双引擎 |
| 人工 Review / 金标冻结 / 二元分 / severe | MCP 与评测硬规则 |
| 上线完整流程第 6 步 | **非目标**（外仓） |
| 16 Skill / 14 维 / 216+ 用例 | 资产清单目标，实现期逐步填充 |
