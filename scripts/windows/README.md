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
