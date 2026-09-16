<#
  Creates the Tick shortcuts: Start Menu and Desktop launchers, plus the
  AutoHotkey bridge that makes Ctrl+Alt+Space reach quick capture.

  The shortcuts carry no shortcut key. Tick holds two hotkeys itself and no
  more: Ctrl+Alt+X grabs a region, Ctrl+Alt+C saves the whole screen.

    powershell -ExecutionPolicy Bypass -File scripts\install-shortcuts.ps1
    powershell -ExecutionPolicy Bypass -File scripts\install-shortcuts.ps1 -Remove
#>
param(
  [switch]$Remove,
  [switch]$NoStartup,
  [switch]$NoDesktop
)

$ErrorActionPreference = 'Stop'

$root     = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
$icon     = Join-Path $root 'assets\icon.ico'

$programs   = Join-Path ([Environment]::GetFolderPath('Programs')) 'Tick.lnk'
$startupLnk = Join-Path ([Environment]::GetFolderPath('Startup'))  'Tick.lnk'
$desktopLnk = Join-Path ([Environment]::GetFolderPath('Desktop'))  'Tick.lnk'

$all = @($programs, $startupLnk, $desktopLnk)

# Always clear the old ones first. A stale .lnk keeps its hotkey registered
# with Explorer, which would collide with the new one.
foreach ($lnk in $all) {
  if (Test-Path $lnk) { Remove-Item $lnk -Force; Write-Host "removed $lnk" }
}

if ($Remove) {
  $runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
  foreach ($name in @('Tick', 'TickCaptureBridge')) {
    if (Get-ItemProperty -Path $runKey -Name $name -ErrorAction SilentlyContinue) {
      Remove-ItemProperty -Path $runKey -Name $name -Force
      Write-Host "removed run entry $name"
    }
  }
  Write-Host "`nAll Tick shortcuts and startup entries removed."
  return
}

if (-not (Test-Path $electron)) {
  throw "Electron not found at $electron - run 'npm install' in $root first."
}

function New-TickShortcut {
  param([string]$Path, [string]$Args)
  $shell = New-Object -ComObject WScript.Shell
  $sc = $shell.CreateShortcut($Path)
  $sc.TargetPath       = $electron
  $sc.Arguments        = ('"' + $root + '"' + $(if ($Args) { " $Args" } else { '' }))
  $sc.WorkingDirectory = $root
  $sc.Description      = 'Tick - cartoon pomodoro desk pet'
  if (Test-Path $icon) { $sc.IconLocation = $icon }
  $sc.WindowStyle      = 7                      # minimized: no console flash
  $sc.Save()
  Write-Host ("created {0}" -f $Path)
}

# Tick's dock button also opens this one, so the Start Menu shortcut stays.
New-TickShortcut -Path $programs

# Auto-start is owned by the app itself now (Settings > Start with Windows),
# so a Startup shortcut here would just launch a second copy at login.
if (Test-Path $startupLnk) { Remove-Item $startupLnk -Force }

if (-not $NoDesktop) { New-TickShortcut -Path $desktopLnk }

# ---------------------------------------------------------------------------
# The Ctrl+Alt+Space bridge.
#
# Windows gives a hotkey to whoever registered it first, so Tick cannot take
# Ctrl+Alt+Space off an app that already holds it. A low-level keyboard hook
# can - it sees the keystroke before Windows dispatches hotkeys at all. That is
# what the AutoHotkey script does: it swallows Ctrl+Alt+Space and forwards to
# Ctrl+Alt+Q, which Tick always holds.
# ---------------------------------------------------------------------------
$runKey   = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$bridgeNm = 'TickCaptureBridge'
$bridgeAhk = Join-Path $root 'scripts\capture-hotkey.ahk'
# v2 lands in a different folder depending on how it was installed, so look
# everywhere it is known to be - one missing path silently costs you the bridge.
$ahkExe = @(
  "$env:LOCALAPPDATA\Programs\AutoHotkey\v2\AutoHotkey64.exe",
  "$env:ProgramFiles\AutoHotkey\v2\AutoHotkey64.exe",
  "$env:LOCALAPPDATA\Programs\AutoHotkey2\AutoHotkey64.exe",
  "$env:ProgramFiles\AutoHotkey2\AutoHotkey64.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($ahkExe) {
  $cmd = '"' + $ahkExe + '" "' + $bridgeAhk + '"'
  Set-ItemProperty -Path $runKey -Name $bridgeNm -Value $cmd
  Write-Host "registered the Ctrl+Alt+Space bridge (AutoHotkey)"
} else {
  Write-Host "AutoHotkey v2 not found - Ctrl+Alt+Space bridge skipped."
  Write-Host "Tick will use its own fallback hotkey instead."
}

Write-Host ""
Write-Host "Ctrl+Alt+Space  quick capture (via the AutoHotkey bridge)"
Write-Host "Ctrl+Alt+X      grab a region of the screen   (only while Tick runs)"
Write-Host "Ctrl+Alt+C      save the whole screen         (only while Tick runs)"
Write-Host ""
Write-Host "Undo with: powershell -ExecutionPolicy Bypass -File scripts\install-shortcuts.ps1 -Remove"
