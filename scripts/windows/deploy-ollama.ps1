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

Invoke-OptionalPull -Name $Model
Write-Host 'Done. Health check OK.'
exit 0
