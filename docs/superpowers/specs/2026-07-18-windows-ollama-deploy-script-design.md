# Windows Ollama Deploy Script

**日期：** 2026-07-18  
**状态：** Draft（待用户确认后 Approved）  
**宿主：** harness-console 仓库运维脚本（在执行脚本的 Windows 机器上运行）  
**范围：** 单文件 PowerShell：安装 Ollama、局域网暴露、可选拉模型、打印 CCB Remote URL  
**非范围：** 改 CCB / Settings UI、macOS/Linux 脚本、GPU 驱动、Ollama API 鉴权、模型推荐策略

## 背景与目标

CCB Settings 已支持 Remote Ollama（填 Base URL → `/api/tags` → 选用模型）。缺的是：在一台 Windows 机器上快速变成「可填的 Remote 端点」。

**目标：** 在**运行脚本的那台 Windows 机器**上，一键完成：

1. 安装（或检测已安装）Ollama  
2. 监听全网卡（`OLLAMA_HOST=0.0.0.0:<port>`）  
3. 开放 Windows 防火墙入站 TCP 端口  
4. 可选 `-Model` 拉取模型  
5. 打印局域网 URL，供 CCB `/config` → Remote Ollama 直接使用  

与「开发者本机」无关：脚本以执行机为准。

## 架构结论

采用 **单文件 PowerShell（方案 1）**：

| 组件 | 职责 |
|------|------|
| `scripts/windows/deploy-ollama.ps1` | 安装 / 配置 / 防火墙 / 重启 / 可选 pull / 健康检查 / 打印 URL |
| `scripts/windows/README.md` | 用法、管理员要求、安全提醒、与 CCB Remote 衔接 |

```
deploy-ollama.ps1 (Admin on target Windows)
  ├─ Install (winget → official installer fallback)  [unless -SkipInstall]
  ├─ Machine env: OLLAMA_HOST=0.0.0.0:11434
  ├─ Firewall inbound TCP 11434
  ├─ Restart Ollama process
  ├─ Optional: ollama pull -Model
  └─ Health check + print http://<LAN-IP>:11434 [/v1 for CCB]
```

## 参数

```powershell
.\deploy-ollama.ps1
.\deploy-ollama.ps1 -Model qwen2.5:7b
.\deploy-ollama.ps1 -SkipInstall
.\deploy-ollama.ps1 -Port 11434
```

| 参数 | 默认 | 作用 |
|------|------|------|
| `-Model` | 无 | 若提供则 `ollama pull <name>` |
| `-Port` | `11434` | 监听与防火墙端口 |
| `-SkipInstall` | `$false` | 跳过安装，只做暴露与检查 |
| `-HostBind` | `0.0.0.0` | 写入 `OLLAMA_HOST` 的绑定地址 |

## 执行步骤（幂等）

1. **权限检查** — 非管理员则退出，提示以管理员运行 PowerShell（Machine 环境变量 + 防火墙需要）。
2. **安装**（除非 `-SkipInstall`）  
   - `ollama` 已在 PATH → 跳过  
   - 否则：`winget install Ollama.Ollama --accept-package-agreements --accept-source-agreements`  
   - winget 不可用或失败 → 下载官方 Windows 安装包并静默安装，刷新当前会话 PATH
3. **持久化环境变量（Machine scope）**  
   - `OLLAMA_HOST=<HostBind>:<Port>`（例：`0.0.0.0:11434`）  
   - 同步设 `OLLAMA_ORIGINS=*`（浏览器/跨源客户端用；CCB CLI 不依赖 CORS）
4. **防火墙** — 若尚无同名规则，创建入站 Allow TCP `<Port>`（DisplayName：`Ollama LAN`）
5. **重启 Ollama** — 结束 `ollama*` 相关进程后重新启动，使环境变量生效
6. **可选 pull** — 有 `-Model` 则执行 `ollama pull`
7. **健康检查** — `GET http://127.0.0.1:<Port>/api/tags`；失败则明确报错
8. **输出** — 选一个非回环 IPv4，打印：  
   - Remote Base：`http://<LAN-IP>:<Port>`  
   - CCB 用：`http://<LAN-IP>:<Port>/v1`（与 Settings Ollama Endpoint 约定一致）  
   - 安全提醒：无鉴权，仅建议在可信局域网使用

## 错误处理

| 情况 | 处理 |
|------|------|
| 非管理员 | 立即退出并提示提权 |
| 已安装 | 跳过安装，继续配置 |
| winget 与安装包均失败 | 退出并给出手动安装链接；不半吊子改防火墙 |
| 防火墙规则已存在 | 按 DisplayName 或端口匹配后跳过 |
| 重启后 `/api/tags` 失败 | 报错；提示检查托盘进程/杀软；仍打印预期 URL 供排查 |
| `-Model` pull 失败 | 非零退出；安装与暴露配置不回滚 |
| 无可用局域网 IPv4 | 打印 `127.0.0.1` 并警告手动用 `ipconfig` 查 IP |

## 测试

- 主体脚本以 **Windows 手动验收清单**为准（仓库无 Windows CI 跑 PowerShell 安装）。
- 若抽出纯逻辑（LAN IP 选择、URL 拼接），可做不依赖 Windows 的小测；非必须。

### 手动验收清单

- [ ] 干净机：管理员执行脚本，安装成功，本机 `/api/tags` 可达  
- [ ] 已装机：再次执行幂等，不重复堆防火墙规则  
- [ ] 同网段另一台机器：`curl http://<LAN-IP>:11434/api/tags` 成功  
- [ ] 打印的 `/v1` URL 可填入 CCB Remote Ollama  
- [ ] `-Model qwen2.5:7b` 后 tags 列表含该模型  
- [ ] `-SkipInstall` 在已装环境下只完成暴露与检查  

## 成功标准

1. 在执行脚本的 Windows 机器上，管理员一键完成安装（或跳过）+ 局域网暴露  
2. 同网段客户端能访问 `http://<LAN-IP>:11434/api/tags`  
3. 终端打印的 URL 可直接用于 CCB `/config` → Remote Ollama  
4. 可选 `-Model` 拉取成功并出现在 tags  
5. 重复执行不报错、不重复创建防火墙规则  

## 安全说明

绑定 `0.0.0.0` 后，同网段任意设备可调用 Ollama API（无鉴权），包括加载/推理模型。仅在可信局域网使用；不要对公网开放 11434。

## 与 CCB 的衔接

- CCB Settings Endpoint：Remote Ollama 填 Base URL（脚本打印的 `http://<LAN-IP>:<Port>` 或带 `/v1` 均可；CCB 侧会规范化为 `…/v1`）  
- API Key 可选；默认占位 `ollama` 即可  
- 本脚本不修改 `~/.claude/settings.json`；配置发生在客户端 CCB

## 实现触及点（供计划阶段）

- 新建 `scripts/windows/deploy-ollama.ps1`  
- 新建 `scripts/windows/README.md`  
- 不改 `ccb/` 应用代码  
