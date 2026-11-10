# 每天提交代码（配合《04_开发协作规范.md》§1 的 Git Flow）
#
# 用法（在项目任意目录执行都可以）：
#   .\scripts\daily.ps1                                  # 当天第一次：自动开 feature/daily-yyyyMMdd 并提交
#   .\scripts\daily.ps1 "feat(goods): 商品导出按分类聚合"   # 带提交说明
#   .\scripts\daily.ps1 -DryRun                           # 只看会执行什么，不真提交
#
# 行为：
#   1. 在 main / develop 上运行时，自动从 origin/develop 切出 feature/daily-<日期>（一天一个分支，符合 §1）
#   2. 已在 feature/release/hotfix 分支上时，直接在当前分支提交
#   3. git add -A → 危险文件自检 → commit → push
#   4. 打印建 PR 的链接（目标 develop，合并方式 Squash）

param(
    [Parameter(Position = 0)]
    [string]$Message,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Get-GitPath {
    $cmd = Get-Command git -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($p in @("C:\Program Files\Git\cmd\git.exe", "C:\Program Files (x86)\Git\cmd\git.exe")) {
        if (Test-Path -LiteralPath $p) { return $p }
    }
    throw "未找到 git：请把 C:\Program Files\Git\cmd 加入 PATH"
}

$Git = Get-GitPath
$Repo = Split-Path -Parent $PSScriptRoot

function G {
    param([string[]]$GitArgs, [switch]$AllowFail)
    $line = "git " + ($GitArgs -join ' ')
    if ($DryRun) { Write-Host "  [dry-run] $line" -ForegroundColor DarkGray; return "" }
    $out = & $Git -C $Repo @GitArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        if ($AllowFail) { return "" }
        throw "git 失败：$line`n$out"
    }
    return ($out | Out-String)
}

function GRead {
    param([string[]]$GitArgs, [switch]$AllowFail)
    $out = & $Git -C $Repo @GitArgs 2>&1
    if ($LASTEXITCODE -ne 0) { if ($AllowFail) { return "" } throw "git 失败：$($GitArgs -join ' ')`n$out" }
    return ($out | Out-String).Trim()
}

$inside = GRead @('rev-parse', '--is-inside-work-tree') -AllowFail
if ($inside -ne 'true') { throw "不是 git 仓库：$Repo" }

$branch = GRead @('rev-parse', '--abbrev-ref', 'HEAD')
$date = Get-Date -Format 'yyyyMMdd'
$dailyBranch = "feature/daily-$date"

Write-Host "== 每日提交 ==" -ForegroundColor Green
Write-Host "仓库：$Repo"
Write-Host "当前分支：$branch"

# 在长期分支上 → 先切出当天分支
if ($branch -eq 'main' -or $branch -eq 'develop') {
    $exists = (GRead @('branch', '--list', $dailyBranch) -AllowFail)
    if ($exists) {
        Write-Host "→ 切到已存在的 $dailyBranch" -ForegroundColor Yellow
        G @('switch', $dailyBranch) | Out-Null
    }
    else {
        Write-Host "→ 从 origin/develop 切出 $dailyBranch" -ForegroundColor Yellow
        G @('fetch', 'origin', 'develop') -AllowFail | Out-Null
        $base = 'origin/develop'
        if (-not (GRead @('rev-parse', '--verify', 'origin/develop') -AllowFail)) { $base = 'develop' }
        G @('switch', '-c', $dailyBranch, $base) | Out-Null
    }
    $branch = $dailyBranch
}
elseif ($branch -like 'feature/*' -or $branch -like 'release/*' -or $branch -like 'hotfix/*') {
    Write-Host "→ 在当前工作分支上提交" -ForegroundColor Yellow
}
else {
    throw "当前分支 $branch 不在 Git Flow 约定内（main/develop/feature/release/hotfix）"
}

# 暂存全部改动
G @('add', '-A') | Out-Null

# 危险文件自检（.gitignore 之外的第二道保险）
$staged = GRead @('diff', '--cached', '--name-only')
if ($staged -match '(?m)^(.*/)?\.env($|\.(?!example$))|node_modules/|(^|/)dist/') {
    throw "暂存区包含不该提交的文件（.env / node_modules / dist），已中止。检查 .gitignore 后重试：`n$staged"
}

# 没有任何改动
$changed = GRead @('diff', '--cached', '--name-only')
if (-not $changed) {
    Write-Host "今天没有需要提交的改动。" -ForegroundColor Yellow
    exit 0
}

$files = ($changed -split "`n" | Where-Object { $_.Trim() })
Write-Host "本次改动 $($files.Count) 个文件：" -ForegroundColor Cyan
$files | Select-Object -First 15 | ForEach-Object { Write-Host "  $_" }
if ($files.Count -gt 15) { Write-Host "  …（其余 $($files.Count - 15) 个）" }

if (-not $Message) { $Message = "chore(daily): $date 日常提交" }

G @('commit', '-m', $Message) | Out-Null
Write-Host "已提交：$Message" -ForegroundColor Green

G @('push', '-u', 'origin', 'HEAD') | Out-Null
Write-Host "已推送 origin/$branch" -ForegroundColor Green

$remote = GRead @('remote', 'get-url', 'origin') -AllowFail
if ($remote -match 'github\.com[:/](\S+?)(\.git)?$') {
    $web = "https://github.com/$($Matches[1])"
    Write-Host "开 PR：$web/compare/develop...$branch`?expand=1  → 选 Squash and merge" -ForegroundColor Yellow
}

Write-Host "完成。"
