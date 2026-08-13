param(
  [switch]$NoBrowser,
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot
$logPath = Join-Path $projectRoot "startup.log"
$dataPidPath = Join-Path $projectRoot ".data-server.pid"
$webPidPath = Join-Path $projectRoot ".web-server.pid"

function Write-StartupLog([string]$message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $message
  Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

function Resolve-Program([string]$name, [string]$fallback) {
  $command = Get-Command $name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  if (Test-Path -LiteralPath $fallback) { return $fallback }
  throw "未找到 $name。请安装 Node.js 22 或更高版本。"
}

function Test-LocalUrl([string]$url) {
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Wait-LocalUrl([string]$url, [int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-LocalUrl $url) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Start-HiddenProcess([string]$filePath, [string[]]$arguments) {
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $filePath
  $startInfo.Arguments = ($arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join " "
  $startInfo.WorkingDirectory = $projectRoot
  $startInfo.UseShellExecute = $true
  $startInfo.CreateNoWindow = $true
  $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  $process = [System.Diagnostics.Process]::Start($startInfo)
  if (-not $process) { throw "后台进程启动失败：$filePath" }
  return $process
}

function Stop-ManagedProcess([string]$pidPath) {
  if (-not (Test-Path -LiteralPath $pidPath)) { return }
  $savedPid = [int](Get-Content -LiteralPath $pidPath -Raw)
  $process = Get-Process -Id $savedPid -ErrorAction SilentlyContinue
  if ($process -and $process.ProcessName -eq "node") {
    Stop-Process -Id $savedPid -Force
    $process.WaitForExit(5000) | Out-Null
  }
  Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
}

try {
  Write-StartupLog "launcher started"
  $nodePath = Resolve-Program "node.exe" "$env:ProgramFiles\nodejs\node.exe"
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) {
    throw "缺少程序依赖，请先在项目目录运行 npm install。"
  }

  Write-Host "正在启动轨道图工坊……" -ForegroundColor Cyan

  Stop-ManagedProcess $webPidPath
  Stop-ManagedProcess $dataPidPath
  Start-Sleep -Milliseconds 300

  if (-not (Test-LocalUrl "http://127.0.0.1:4175/api/health")) {
    $dataProcess = Start-HiddenProcess $nodePath @((Join-Path $projectRoot "local-data-server.mjs"))
    Set-Content -LiteralPath $dataPidPath -Value $dataProcess.Id -Encoding ASCII
  }
  if (-not (Wait-LocalUrl "http://127.0.0.1:4175/api/health" 20)) {
    throw "无法连接本地数据服务（端口 4175）。"
  }

  if (-not (Test-LocalUrl "http://127.0.0.1:3000/")) {
    $vinextCli = Join-Path $projectRoot "node_modules\vinext\dist\cli.js"
    $webProcess = Start-HiddenProcess $nodePath @($vinextCli, "dev", "--hostname", "127.0.0.1")
    Set-Content -LiteralPath $webPidPath -Value $webProcess.Id -Encoding ASCII
  }
  if (-not (Wait-LocalUrl "http://127.0.0.1:3000/" 40)) {
    throw "无法连接本地网页（端口 3000）。"
  }

  Write-StartupLog "startup completed"
  Write-Host "启动完成：网页和数据服务均已连接。" -ForegroundColor Green
  Write-Host "数据保存在 data 目录，关闭此窗口不会删除数据。"
  if (-not $NoBrowser) { Start-Process "http://localhost:3000/?storage=http" }
} catch {
  Write-StartupLog ("startup failed: " + $_.Exception.Message)
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "详细时间记录已写入 startup.log。" -ForegroundColor Yellow
  if (-not $NoPause) { Read-Host "按 Enter 键关闭" | Out-Null }
  exit 1
}

if (-not $NoPause) { Read-Host "按 Enter 键关闭此提示窗口" | Out-Null }
