# 每天提交代码（配合《04_开发协作规范.md》§1 的 Git Flow）
#
# 用法（在项目任意目录执行都可以）：
#   .\scripts\daily.ps1                                  # 当天第一次：自动开 feature/daily-yyyyMMdd，只提交 frontend/
#   .\scripts\daily.ps1 "feat(goods): 商品导出按分类聚合"   # 带提交说明
#   .\scripts\daily.ps1 -Scope all "docs: 同步接口契约"    # 提交整个仓库（文档/后端也一起）
#   .\scripts\daily.ps1 -DryRun                           # 只看会执行什么，不真提交
#
# 行为：
#   1. 在 main / develop 上运行时，自动从 origin/develop 切出 feature/daily-<日期>（一天一个分支，符合 §1）
#   2. 已在 feature/release/hotfix 分支上时，直接在当前分支提交
#   3. 默认只 git add frontend/（你的代码目录）；-Scope all 才暂存整仓
#   4. 危险文件自检 → commit → push → 打印 PR 链接（目标 develop，合并方式 Squash）

param(
    [Parameter(Position = 0)]
    [string]$Message,
    [ValidateSet('frontend', 'all')]
    [string]$Scope = 'frontend',
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

# 在长期分支（或非当天的旧日常分支）上 → 切出当天分支
$isStaleDaily = ($branch -like 'feature/daily-*') -and ($branch -ne $dailyBranch)
if ($branch -eq 'main' -or $branch -eq 'develop' -or $isStaleDaily) {
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

# 按范围暂存：默认只提交 frontend（前端代码目录），-Scope all 才整仓
if ($DryRun) {
    $stArgs = @('status', '--porcelain')
    if ($Scope -eq 'frontend') { $stArgs += @('--', 'frontend') }
    # 不用 GRead：它对整体做了 Trim，会吃掉行首的状态位，Substring(3) 就会切错
    $raw = (& $Git -C $Repo @stArgs 2>&1 | Out-String)
    $changed = ((($raw -split '\r?\n') | Where-Object { $_.Length -gt 3 } |
        ForEach-Object { $_.Substring(3).Trim() }) -join "`n").Trim()
    $scopeText = if ($Scope -eq 'frontend') { 'frontend/' } else { '整个仓库' }
    Write-Host "提交范围：$scopeText（dry-run，按 status 估算）" -ForegroundColor Cyan
}
elseif ($Scope -eq 'frontend') {
    Write-Host "提交范围：frontend/（-Scope all 可提交整仓）" -ForegroundColor Cyan
    G @('add', '-A', '--', 'frontend') | Out-Null
    $changed = GRead @('diff', '--cached', '--name-only')
    $outside = ($changed -split "`n" | Where-Object { $_ -and $_ -notlike 'frontend/*' })
    if ($outside) {
        throw "暂存区里出现了 frontend 之外的文件，已中止（避免把别的东西混进前端提交）：`n$($outside -join "`n")"
    }
}
else {
    Write-Host "提交范围：整个仓库" -ForegroundColor Cyan
    G @('add', '-A') | Out-Null
    $changed = GRead @('diff', '--cached', '--name-only')
}

# 危险文件自检（.gitignore 之外的第二道保险）
$staged = $changed
if ($staged -match '(?m)^(.*/)?\.env($|\.(?!example$))|node_modules/|(^|/)dist/') {
    throw "暂存区包含不该提交的文件（.env / node_modules / dist），已中止。检查 .gitignore 后重试：`n$staged"
}

# 没有任何改动
if (-not $changed) {
    if ($Scope -eq 'frontend') {
        $dirty = GRead @('status', '--porcelain')
        if ($dirty) { Write-Host "frontend/ 没有改动，但仓库其他位置有改动；需要一起提交请加 -Scope all" -ForegroundColor Yellow }
        else { Write-Host "今天没有需要提交的改动。" -ForegroundColor Yellow }
    }
    else {
        Write-Host "今天没有需要提交的改动。" -ForegroundColor Yellow
    }
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
