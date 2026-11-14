# What's playing (Spotify, a YouTube tab, any player Windows' media controls know), for Capri's
# "Comment on what I do": the title, the artist, the app, playing or paused. A line of JSON each time
# it changes. Started only while that option is on (main.js), stopped with her.
# ASCII only: Windows PowerShell reads this file as ANSI.
param([int]$ParentPid = 0)
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  [void]$task.Wait(-1)
  $task.Result
}
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
if (-not $manager) { exit 1 }
$last = ''
$tick = 0
while ($true) {
  $line = '{}'
  try {
    $session = $manager.GetCurrentSession()
    if ($session) {
      $props = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $playing = [string]$session.GetPlaybackInfo().PlaybackStatus -eq 'Playing'
      $line = [ordered]@{ title = [string]$props.Title; artist = [string]$props.Artist; app = [string]$session.SourceAppUserModelId; playing = $playing } | ConvertTo-Json -Compress
    }
  } catch { $line = '{}' }
  if ($line -ne $last) {
    [Console]::Out.WriteLine($line)
    [Console]::Out.Flush()
    $last = $line
  }
  $tick++
  if ($ParentPid -and ($tick % 5 -eq 0) -and -not (Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Seconds 3
}
