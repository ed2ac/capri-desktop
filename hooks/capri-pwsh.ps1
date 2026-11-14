# Capri <- your PowerShell (Windows PowerShell 5.1 or PowerShell 7). She reacts to a command that
# failed, one that took a while, a git push or commit, tests that pass: like hooks/capri-shell.sh does
# for bash and zsh. Loaded from your PowerShell profile; her menu (Windows) puts the line there:
#
#   . "C:\...\hooks\capri-pwsh.ps1"   # capri: reacts to your terminal
#
# Rule #1: never get in your way. It wraps your prompt (yours still runs, as it was), sends in the
# background without waiting, prints nothing, and keeps $LASTEXITCODE as it was. Only to 127.0.0.1.
# ASCII only: Windows PowerShell reads this file as ANSI.

if ($global:CapriPwshLoaded) { return }
$global:CapriPwshLoaded = $true
if (-not $env:CAPRI_PORT) { $env:CAPRI_PORT = '47823' }
if (-not $env:CAPRI_SHELL_MIN) { $env:CAPRI_SHELL_MIN = '15' }

$global:CapriQuiet = '^(select-string|sls|findstr|grep|rg|test-path|test-connection|compare-object|diff|where|where\.exe|get-command|gcm|more|less|man|help|get-help|vim|nvim|nano|notepad|code|ssh|top|htop|wsl|claude|codex|gemini|ollama|python3?|py|node|cd|set-location|sl|pushd|popd|cls|clear|clear-host|exit|history|h|sleep|start-sleep|ping|git (diff|log|show|status|grep|branch|blame))(\s|$)'
$global:CapriSecret = '(?i)(token|secret|pass|key=|authorization|bearer|-p\S|credential)'
$global:CapriTests = '(?i)(^|\s)(npm|pnpm|yarn|bun)\s+(run\s+)?test|(jest|vitest|mocha|pytest|phpunit|rspec)(\s|$)|(cargo|go|dotnet|mvn|gradle)\s+test|node\s+--test|invoke-pester'
$global:CapriLastId = (Get-History -Count 1 -ErrorAction SilentlyContinue).Id
try {
  Add-Type -AssemblyName System.Net.Http -ErrorAction SilentlyContinue
  $global:CapriHttp = New-Object System.Net.Http.HttpClient
  $global:CapriHttp.Timeout = [TimeSpan]::FromSeconds(2)
} catch { $global:CapriHttp = $null }

function global:CapriReport([bool]$ok, $nativeCode) {
  $h = Get-History -Count 1 -ErrorAction SilentlyContinue
  if (-not $h -or $h.Id -eq $global:CapriLastId) { return }
  $global:CapriLastId = $h.Id
  $cmd = $h.CommandLine.Trim()
  if (-not $cmd -or $cmd -match $global:CapriQuiet) { return }
  $ms = [int](($h.EndExecutionTime - $h.StartExecutionTime).TotalMilliseconds)
  $code = 0
  if (-not $ok) { if ($nativeCode -and $nativeCode -ne 0) { $code = [int]$nativeCode } else { $code = 1 } }
  if ($code -eq -1073741510) { return } # Ctrl+C on a native program: you stopped it yourself
  if ($code -eq 0 -and $ms -lt ([int]$env:CAPRI_SHELL_MIN * 1000)) {
    if (-not ($cmd -match '^git\s+(push|commit)(\s|$)' -or $cmd -match $global:CapriTests)) { return }
  }
  if ($cmd -match $global:CapriSecret) {
    # the program's name alone; an assignment ($env:TOKEN=...) not even that
    $first = ($cmd -split '\s+')[0]
    if ($first -match '[=$]') { $cmd = '(command hidden)' } else { $cmd = $first }
  }
  if ($cmd.Length -gt 200) { $cmd = $cmd.Substring(0, 200) + '...' }
  $body = @{ hook_event_name = 'ShellCommand'; command = $cmd; exit_code = $code; duration_ms = $ms; cwd = (Get-Location).Path } | ConvertTo-Json -Compress
  if (-not $global:CapriHttp) { return }
  $content = New-Object System.Net.Http.StringContent($body, [System.Text.Encoding]::UTF8, 'application/json')
  $null = $global:CapriHttp.PostAsync("http://127.0.0.1:$($env:CAPRI_PORT)/event", $content) # not waited for
}

# your prompt, wrapped: first a look at the command that just ended, then yours as it was
$global:CapriPrevPrompt = $function:prompt
function global:prompt {
  $ok = $?
  $native = $global:LASTEXITCODE
  try { CapriReport $ok $native } catch { }
  $global:LASTEXITCODE = $native
  if ($global:CapriPrevPrompt) { & $global:CapriPrevPrompt } else { "PS $($executionContext.SessionState.Path.CurrentLocation)$('>' * ($nestedPromptLevel + 1)) " }
}
