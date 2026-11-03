﻿﻿﻿$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot

function Write-Step([string]$Text) { Write-Host $Text -ForegroundColor Cyan }
function Write-Warn2([string]$Text) { Write-Host $Text -ForegroundColor Yellow }
function Write-Err2([string]$Text) { Write-Host $Text -ForegroundColor Red }

Write-Host "============================================"
Write-Host "  name 一键上传 GitHub 工具"
Write-Host "============================================"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Err2 "[错误] 未检测到 Git，请先安装 Git for Windows"
    exit 1
}

Write-Step "正在生成 .gitignore ..."
$gitignore = @"
node_modules/
dist/
.jdk/
android/.gradle/
android/.kotlin/
android/app/build/
android/build/
android/local.properties
android/app/src/main/assets/public
android/capacitor-cordova-android-plugins
*.apk
*.aab
.screenshots/
.trae-html-share-packages/
"@
Set-Content -LiteralPath '.gitignore' -Value $gitignore -Encoding ASCII

if (-not (Test-Path -LiteralPath '.git')) {
    Write-Step "正在初始化 Git 仓库 ..."
    git init | Out-Host
    git branch -M main
}

$gitUser = git config user.name 2>$null
if (-not $gitUser) {
    git config user.name "FishCRM-Developer"
    git config user.email "fishcrm@users.noreply.github.com"
}

git rm -r --cached node_modules .jdk dist android/.gradle android/app/build 2>$null | Out-Null

$TargetRepo = "https://github.com/1959608511/name.git"

$currentUrl = (git remote get-url origin 2>$null)
if ($currentUrl -and $currentUrl.Trim() -ne $TargetRepo) {
    git remote set-url origin $TargetRepo
} elseif (-not $currentUrl) {
    git remote add origin $TargetRepo
}
Write-Step "准备上传到 GitHub 的 name 仓库"

Write-Step "正在整理本地文件 ..."
git add -A | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Err2 "整理文件失败，请关闭正在编辑文件的程序后再试。"
    exit 1
}
git branch -M main
git commit -m "backup: name 自动同步备份 ($(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))" | Out-Null

Write-Step "正在上传到 GitHub，请稍候（若弹出登录窗口请完成授权）..."

$pushOk = $false
$maxAttempts = 3
for ($i = 1; $i -le $maxAttempts -and -not $pushOk; $i++) {
    git push -u origin main 2>$null | Out-Null
    $pushOk = ($LASTEXITCODE -eq 0)
    if (-not $pushOk -and $i -lt $maxAttempts) {
        Write-Warn2 "网络不太稳定，正在自动重试（第 $($i + 1) 次）..."
        Start-Sleep -Seconds 5
    }
}

if (-not $pushOk) {
    Write-Warn2 "上传遇到阻碍，正在自动处理..."
    git pull origin main --allow-unrelated-histories --no-edit 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        git push -u origin main 2>$null | Out-Null
        $pushOk = ($LASTEXITCODE -eq 0)
    }
}

if (-not $pushOk) {
    Write-Warn2 "远端仓库里有和本地不一样的内容，无法自动合并。"
    $answer = Read-Host "是否用本地文件覆盖远端（会删掉远端旧内容）？输入 y 确认"
    if ($answer -eq 'y') {
        git push --force origin main 2>$null | Out-Null
        $pushOk = ($LASTEXITCODE -eq 0)
    }
}

if (-not $pushOk) {
    Write-Host ""
    Write-Err2 "上传失败，请检查网络后重新双击本脚本。"
    Write-Host "如果多次都失败，可能是没有登录 GitHub 或网络无法访问 GitHub。"
    exit 1
}

# ---------- 上传完整性校验 ----------
Write-Host ""
Write-Step "上传完成，正在校验文件是否全部传成功 ..."

$localHash = (git rev-parse HEAD).Trim()

$remoteInfo = git ls-remote origin main 2>$null
if (-not $remoteInfo) {
    Write-Err2 "校验失败：连不上 GitHub，请检查网络后重新双击本脚本。"
    exit 1
}
$remoteHash = ($remoteInfo -split '\s+')[0].Trim()

if ($remoteHash -ne $localHash) {
    Write-Err2 "校验失败：远端和本地内容不一致，可能网络波动没传完整。"
    Write-Host "请重新双击本脚本再传一次。"
    exit 1
}

# 提交哈希一致后，再逐文件比对文件清单（双保险）
git fetch origin main --quiet 2>$null
$localFiles  = @(git ls-files)
$remoteFiles = @(git ls-tree -r origin/main --name-only)

$missing = @($localFiles | Where-Object { $remoteFiles -notcontains $_ })
$extra   = @($remoteFiles | Where-Object { $localFiles -notcontains $_ })

if ($missing.Count -eq 0 -and $extra.Count -eq 0) {
    Write-Host ""
    Write-Host "校验完成，全部 $($localFiles.Count) 个文件已成功上传到 GitHub，一个不缺。" -ForegroundColor Green
    exit 0
}

Write-Err2 "校验失败：远端文件和本地对不上，可能网络波动没传完整。"
Write-Host "请重新双击本脚本再传一次。"
exit 1
