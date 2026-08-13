param(
  [switch]$NoBrowser,
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot

function Resolve-Program([string]$name, [string]$fallback) {
  $command = Get-Command $name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  if (Test-Path -LiteralPath $fallback) { return $fallback }
  throw "未找到 $name。请先安装 Node.js 22 或更高版本。"
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
}

try {
  $nodePath = Resolve-Program "node.exe" "$env:ProgramFiles\nodejs\node.exe"
  $npmPath = Resolve-Program "npm.cmd" "$env:ProgramFiles\nodejs\npm.cmd"

  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) {
    throw "缺少程序依赖，请先在项目目录运行 npm install。"
  }

  Write-Host "正在启动轨道图工坊……" -ForegroundColor Cyan

  if (-not (Test-LocalUrl "http://127.0.0.1:4175/api/health")) {
    Start-HiddenProcess $nodePath @((Join-Path $projectRoot "local-data-server.mjs"))
  }

  if (-not (Wait-LocalUrl "http://127.0.0.1:4175/api/health" 20)) {
    throw "无法连接本地数据服务（端口 4175）。"
  }

  if (-not (Test-LocalUrl "http://127.0.0.1:3000/")) {
    Start-HiddenProcess $npmPath @("run", "start")
  }

  if (-not (Wait-LocalUrl "http://127.0.0.1:3000/" 40)) {
    throw "无法连接本地网页（端口 3000）。"
  }

  Write-Host "启动完成：网页和数据服务均已连接。" -ForegroundColor Green
  Write-Host "数据保存在 data 目录，关闭此窗口不会删除数据。"
  if (-not $NoBrowser) {
    Start-Process "http://localhost:3000/?storage=http"
  }
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  if (-not $NoPause) { Read-Host "按 Enter 键关闭" | Out-Null }
  exit 1
}

if (-not $NoPause) {
  Read-Host "按 Enter 键关闭此提示窗口" | Out-Null
}
