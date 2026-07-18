# Windows Ollama Deploy Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single admin PowerShell script that installs Ollama on the Windows machine where it runs, exposes it on the LAN, optionally pulls a model, and prints a CCB Remote Ollama URL.

**Architecture:** One idempotent `deploy-ollama.ps1` (Machine-scope `OLLAMA_HOST`, firewall rule, process restart, health check) plus a short README. No CCB app code changes.

**Tech Stack:** PowerShell 5.1+ (Windows), winget / official Ollama installer, Windows Firewall (`New-NetFirewallRule`)

**Spec:** [2026-07-18-windows-ollama-deploy-script-design.md](../specs/2026-07-18-windows-ollama-deploy-script-design.md)

## Global Constraints

- Host: **harness-console root** — files under `scripts/windows/`; **do not** modify `ccb/`
- Target OS: Windows only; script runs on the **execution machine**, not the developer Mac
- Params: `-Model` (optional), `-Port` default `11434`, `-SkipInstall` default `$false`, `-HostBind` default `0.0.0.0`
- Env (Machine scope): `OLLAMA_HOST=<HostBind>:<Port>`, `OLLAMA_ORIGINS=*`
- Firewall DisplayName: `Ollama LAN`; inbound Allow TCP `<Port>`
- Health check: `GET http://127.0.0.1:<Port>/api/tags`
- Print both `http://<LAN-IP>:<Port>` and `http://<LAN-IP>:<Port>/v1`
- Require Administrator; fail fast if not elevated
- Install path: winget `Ollama.Ollama` first; fallback official Windows installer download + silent install
- YAGNI: no macOS/Linux script, no GPU driver install, no API auth, no CCB settings writes
- Verification on Mac CI: structural (`rg`/file checks); full run is Windows manual checklist in README

## File structure

```
scripts/windows/
  deploy-ollama.ps1   # main deploy script
  README.md           # usage, admin, security, CCB Remote handoff
```

---

### Task 1: `deploy-ollama.ps1`

**Files:**
- Create: `scripts/windows/deploy-ollama.ps1`

**Interfaces:**
- Consumes: Windows admin PowerShell, optional `winget`, `ollama` CLI after install
- Produces: script with params `-Model`, `-Port`, `-SkipInstall`, `-HostBind`; exit 0 on success; non-zero on hard failures

- [ ] **Step 1: Create script directory and write `deploy-ollama.ps1`**

Implement the full script below (verbatim structure; adjust only if a Windows API name is wrong — keep behavior identical to the spec).

```powershell
#Requires -Version 5.1
<#
.SYNOPSIS
  Install/configure Ollama on this Windows machine for LAN (CCB Remote) access.
.PARAMETER Model
  Optional model to pull (e.g. qwen2.5:7b).
.PARAMETER Port
  Listen / firewall port. Default 11434.
.PARAMETER SkipInstall
  Skip install; only expose + health-check.
.PARAMETER HostBind
  Bind address written to OLLAMA_HOST. Default 0.0.0.0.
#>
[CmdletBinding()]
param(
  [string]$Model = '',
  [int]$Port = 11434,
  [switch]$SkipInstall,
  [string]$HostBind = '0.0.0.0'
)

$ErrorActionPreference = 'Stop'
$FirewallDisplayName = 'Ollama LAN'
$OfficialInstallerUrl = 'https://ollama.com/download/OllamaSetup.exe'

function Test-IsAdministrator {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($id)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-LanIPv4 {
  $candidates = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.PrefixOrigin -ne 'WellKnown' -and
      $_.AddressState -eq 'Preferred'
    } |
    Sort-Object -Property InterfaceMetric |
    Select-Object -ExpandProperty IPAddress -Unique
  if ($candidates -and $candidates.Count -gt 0) { return $candidates[0] }
  return $null
}

function Refresh-PathFromMachine {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machinePath;$userPath"
}

function Install-OllamaIfNeeded {
  Refresh-PathFromMachine
  if (Get-Command ollama -ErrorAction SilentlyContinue) {
    Write-Host 'Ollama already installed; skipping install.'
    return
  }

  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    Write-Host 'Installing Ollama via winget...'
    try {
      & winget install --id Ollama.Ollama -e --accept-package-agreements --accept-source-agreements
      Refresh-PathFromMachine
      if (Get-Command ollama -ErrorAction SilentlyContinue) { return }
    } catch {
      Write-Warning "winget install failed: $($_.Exception.Message)"
    }
  }

  Write-Host 'Falling back to official OllamaSetup.exe...'
  $tmp = Join-Path $env:TEMP 'OllamaSetup.exe'
  try {
    Invoke-WebRequest -Uri $OfficialInstallerUrl -OutFile $tmp -UseBasicParsing
    Start-Process -FilePath $tmp -ArgumentList '/VERYSILENT' -Wait
  } catch {
    Write-Error @"
Failed to install Ollama automatically.
Install manually from https://ollama.com/download then re-run with -SkipInstall.
$($_.Exception.Message)
"@
    exit 1
  }
  Refresh-PathFromMachine
  if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Write-Error 'Ollama installed but ollama.exe not on PATH. Open a new admin PowerShell and re-run with -SkipInstall.'
    exit 1
  }
}

function Set-OllamaMachineEnv {
  param([string]$Bind, [int]$ListenPort)
  $hostValue = "${Bind}:${ListenPort}"
  [Environment]::SetEnvironmentVariable('OLLAMA_HOST', $hostValue, 'Machine')
  [Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', '*', 'Machine')
  $env:OLLAMA_HOST = $hostValue
  $env:OLLAMA_ORIGINS = '*'
  Write-Host "Set Machine OLLAMA_HOST=$hostValue and OLLAMA_ORIGINS=*"
}

function Ensure-OllamaFirewallRule {
  param([int]$ListenPort)
  $existing = Get-NetFirewallRule -DisplayName $FirewallDisplayName -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "Firewall rule '$FirewallDisplayName' already exists; skipping."
    return
  }
  $byPort = Get-NetFirewallPortFilter -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -eq $ListenPort -and $_.Protocol -eq 'TCP' }
  if ($byPort) {
    foreach ($pf in $byPort) {
      $rule = Get-NetFirewallRule -AssociatedNetFirewallPortFilter $pf -ErrorAction SilentlyContinue |
        Where-Object { $_.Direction -eq 'Inbound' -and $_.Action -eq 'Allow' -and $_.Enabled -eq 'True' }
      if ($rule) {
        Write-Host "Inbound Allow TCP $ListenPort already present; skipping new rule."
        return
      }
    }
  }
  New-NetFirewallRule -DisplayName $FirewallDisplayName -Direction Inbound -Action Allow `
    -Protocol TCP -LocalPort $ListenPort -Profile Any | Out-Null
  Write-Host "Created firewall rule '$FirewallDisplayName' (TCP $ListenPort)."
}

function Restart-OllamaApp {
  Get-Process -Name 'ollama*','Ollama*' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  $candidates = @(
    "$env:LOCALAPPDATA\Programs\Ollama\ollama app.exe",
    "$env:LOCALAPPDATA\Programs\Ollama\Ollama.exe",
    "${env:ProgramFiles}\Ollama\ollama app.exe",
    "${env:ProgramFiles}\Ollama\Ollama.exe"
  )
  $started = $false
  foreach ($path in $candidates) {
    if (Test-Path $path) {
      Start-Process -FilePath $path
      $started = $true
      break
    }
  }
  if (-not $started) {
    if (Get-Command ollama -ErrorAction SilentlyContinue) {
      Start-Process -FilePath 'ollama' -ArgumentList 'serve'
      $started = $true
    }
  }
  if (-not $started) {
    Write-Warning 'Could not locate Ollama app to restart; start it from the Start menu, then re-check.'
  } else {
    Write-Host 'Restarted Ollama.'
  }
  # Wait for API
  $ok = $false
  for ($i = 0; $i -lt 30; $i++) {
    try {
      $null = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/tags" -UseBasicParsing -TimeoutSec 2
      $ok = $true
      break
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  return $ok
}

function Invoke-OptionalPull {
  param([string]$Name)
  if ([string]::IsNullOrWhiteSpace($Name)) { return }
  Write-Host "Pulling model '$Name'..."
  & ollama pull $Name
  if ($LASTEXITCODE -ne 0) {
    Write-Error "ollama pull failed for '$Name' (exit $LASTEXITCODE). Install/expose already done; fix pull manually."
    exit 1
  }
}

# --- main ---
if (-not (Test-IsAdministrator)) {
  Write-Error 'Run this script in an elevated (Administrator) PowerShell.'
  exit 1
}

if (-not $SkipInstall) {
  Install-OllamaIfNeeded
} else {
  Refresh-PathFromMachine
  if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Write-Error 'SkipInstall set but ollama not found on PATH.'
    exit 1
  }
}

Set-OllamaMachineEnv -Bind $HostBind -ListenPort $Port
Ensure-OllamaFirewallRule -ListenPort $Port
$healthy = Restart-OllamaApp
Invoke-OptionalPull -Name $Model

$lan = Get-LanIPv4
if (-not $lan) {
  $lan = '127.0.0.1'
  Write-Warning 'No LAN IPv4 found; printed loopback. Run ipconfig to find the real address.'
}

$base = "http://${lan}:${Port}"
$v1 = "$base/v1"
Write-Host ''
Write-Host '=== Ollama LAN endpoint ==='
Write-Host "Remote Base:  $base"
Write-Host "CCB (/v1):    $v1"
Write-Host 'Security: API has no auth — use only on trusted LAN; do not expose to the public internet.'
Write-Host 'In CCB: /config → Endpoint → Remote Ollama → paste Base URL (with or without /v1).'
Write-Host ''

if (-not $healthy) {
  Write-Error "Health check failed for http://127.0.0.1:$Port/api/tags. Check tray app / antivirus. Expected URLs printed above for troubleshooting."
  exit 1
}

Write-Host 'Done. Health check OK.'
exit 0
```

- [ ] **Step 2: Structural verification (Mac-safe)**

Run from repo root:

```bash
test -f scripts/windows/deploy-ollama.ps1
rg -n "OLLAMA_HOST|Ollama LAN|SkipInstall|api/tags|/v1|Test-IsAdministrator|winget install" scripts/windows/deploy-ollama.ps1
```

Expected: file exists; each of those strings appears at least once.

- [ ] **Step 3: Commit**

```bash
git add scripts/windows/deploy-ollama.ps1
git commit -m "$(cat <<'EOF'
feat(scripts): add Windows Ollama LAN deploy PowerShell script

EOF
)"
```

---

### Task 2: `scripts/windows/README.md`

**Files:**
- Create: `scripts/windows/README.md`

**Interfaces:**
- Consumes: behavior of `deploy-ollama.ps1` from Task 1
- Produces: operator docs (admin, params, security, CCB Remote, manual checklist)

- [ ] **Step 1: Write README**

```markdown
# Windows Ollama deploy

Idempotent PowerShell script that installs Ollama **on the machine where you run it**, binds it for LAN access, opens the firewall, and prints a URL for CCB **Remote Ollama**.

## Requirements

- Windows 10/11
- PowerShell **Run as Administrator**
- Network: trusted LAN only (Ollama has **no API auth**)

## Usage

```powershell
cd path\to\harness-console\scripts\windows

# Install + expose on 0.0.0.0:11434
.\deploy-ollama.ps1

# Also pull a model
.\deploy-ollama.ps1 -Model qwen2.5:7b

# Already installed — only expose + health check
.\deploy-ollama.ps1 -SkipInstall

# Custom port
.\deploy-ollama.ps1 -Port 11434
```

If execution policy blocks the script:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\deploy-ollama.ps1
```

## What it does

1. Installs Ollama (winget → official installer fallback) unless `-SkipInstall`
2. Sets **Machine** env: `OLLAMA_HOST=0.0.0.0:11434`, `OLLAMA_ORIGINS=*`
3. Creates inbound firewall rule **Ollama LAN** (TCP 11434) if missing
4. Restarts Ollama and checks `GET http://127.0.0.1:11434/api/tags`
5. Prints LAN Base URL and CCB `/v1` URL

## CCB handoff

1. Note the printed `CCB (/v1)` URL (or Base URL)
2. On the client machine, open CCB → `/config` → **Endpoint** → **Remote Ollama**
3. Paste the URL (with or without `/v1`; CCB normalizes)
4. API key optional (placeholder `ollama` is fine)
5. Pick a model from the tags list

## Security

Binding `0.0.0.0` allows **any device on the LAN** to call the Ollama API (load models, run inference). Do **not** port-forward 11434 to the public internet.

## Manual acceptance checklist

- [ ] Clean Windows: admin run installs; local `/api/tags` works
- [ ] Re-run is idempotent (no duplicate firewall rules)
- [ ] Another LAN host: `curl http://<LAN-IP>:11434/api/tags` succeeds
- [ ] Printed URL works in CCB Remote Ollama
- [ ] `-Model qwen2.5:7b` appears in tags afterward
- [ ] `-SkipInstall` works when Ollama is already installed
```

- [ ] **Step 2: Structural verification**

```bash
test -f scripts/windows/README.md
rg -n "Remote Ollama|Ollama LAN|SkipInstall|trusted LAN|Manual acceptance" scripts/windows/README.md
```

Expected: file exists; strings present.

- [ ] **Step 3: Commit**

```bash
git add scripts/windows/README.md
git commit -m "$(cat <<'EOF'
docs(scripts): document Windows Ollama LAN deploy script

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Single PS1 install + expose + optional model | Task 1 |
| Machine `OLLAMA_HOST` + firewall + print LAN + `/v1` | Task 1 |
| Admin required, winget then official installer | Task 1 |
| Idempotent firewall / skip install | Task 1 |
| README + manual checklist + security | Task 2 |
| No CCB code changes | both |
