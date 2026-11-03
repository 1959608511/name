$ErrorActionPreference = 'Continue'
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
    Write-Warn2 "[提示] 仓库地址已切换为：$TargetRepo"
    git remote set-url origin $TargetRepo
} elseif (-not $currentUrl) {
    git remote add origin $TargetRepo
}
Write-Step "目标仓库：$TargetRepo"

Write-Step "正在扫描并打包源码（已自动过滤 node_modules 与 .jdk）..."
git add -A | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Err2 "[错误] 暂存文件失败，请检查文件权限。"
    exit 1
}
git branch -M main
git commit -m "backup: name 自动同步备份 ($(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))" | Out-Host

Write-Step "正在上传到 GitHub（若弹出登录窗口请完成授权）..."
git push -u origin main | Out-Host
$pushOk = ($LASTEXITCODE -eq 0)

if (-not $pushOk) {
    Write-Warn2 "[提示] 直接推送失败，尝试合并远端已有内容后重试 ..."
    git pull origin main --allow-unrelated-histories --no-edit | Out-Host
    if ($LASTEXITCODE -eq 0) {
        git push -u origin main | Out-Host
        $pushOk = ($LASTEXITCODE -eq 0)
    }
}

if (-not $pushOk) {
    Write-Warn2 "[提示] 自动合并未成功，远端仓库可能已有同名文件。"
    $answer = Read-Host "是否用本地源码覆盖远端内容（强制推送，会删除远端历史）？输入 y 确认"
    if ($answer -eq 'y') {
        git push --force origin main | Out-Host
        $pushOk = ($LASTEXITCODE -eq 0)
    }
}

if ($pushOk) {
    Write-Host ""
    Write-Host "[完成] 已成功上传到 GitHub" -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Err2 "[失败] 上传未完成，常见原因："
Write-Host "  1. 未登录 GitHub 或授权被取消"
Write-Host "  2. 仓库地址错误，或该账号没有写入权限"
Write-Host "  3. 远端存在冲突内容，需要先手动执行 git pull"
Write-Host "请把上方报错信息发给开发者。"
exit 1
