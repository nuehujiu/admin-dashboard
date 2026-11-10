# Git Flow 辅助脚本（对应《04_开发协作规范.md》§1 分支模型）
#
# 用法（在仓库根目录）：
#   .\scripts\git-flow.ps1 init                     # 建 develop 并推到 origin（首次）
#   .\scripts\git-flow.ps1 start  -Name goods-export # feature/goods-export ← develop
#   .\scripts\git-flow.ps1 pr                       # 推送当前分支 + 打印建 PR 的链接
#   .\scripts\git-flow.ps1 release -Version 1.0.0    # release/v1.0.0 ← develop
#   .\scripts\git-flow.ps1 hotfix  -Name login-500   # hotfix/login-500 ← 最新 tag
#   .\scripts\git-flow.ps1 backmerge                 # main → develop 回灌（release/hotfix 后必做）
#   .\scripts\git-flow.ps1 tag     -Version 1.0.0    # 在 main 上打 annotated tag 并推送
#   .\scripts\git-flow.ps1 finish                    # 合并后收尾：切回主干、拉取、删本地分支
#   .\scripts\git-flow.ps1 status                    # 当前分支、保护分支差异、最近图
#   .\scripts\git-flow.ps1 clean                     # 删除已合并进 develop 的本地分支
#
# 任何子命令加 -DryRun 只打印将要执行的 git 命令，不实际执行。

param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('init', 'start', 'pr', 'release', 'hotfix', 'backmerge', 'tag', 'finish', 'status', 'clean')]
    [string]$Action,

    [string]$Name,
    [string]$Version,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Get-GitPath {
    $cmd = Get-Command git -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($p in @("C:\Program Files\Git\cmd\git.exe", "C:\Program Files (x86)\Git\cmd\git.exe")) {
        if (Test-Path -LiteralPath $p) { return $p }
    }
    throw "未找到 git：请把 C:\Program Files\Git\cmd 加入 PATH 后重开终端"
}

$Git = Get-GitPath

function Invoke-Git {
    param(
        [string[]]$GitArgs,
        [switch]$AllowFail
    )
    $line = "git " + ($GitArgs -join ' ')

    # 只读命令（rev-parse / ls-remote / remote get-url / describe / rev-list / log / status / fetch…）
    # 即使在 -DryRun 下也真实执行，否则前置检查与分支名判断会拿不到值。写操作才被 dry-run 拦。
    $readOnlyVerbs = @('rev-parse', 'ls-remote', 'describe', 'rev-list', 'log', 'status', 'fetch', 'show')
    $isRead = ($GitArgs[0] -in $readOnlyVerbs) -or
              ($GitArgs[0] -eq 'remote' -and $GitArgs.Count -gt 1 -and $GitArgs[1] -eq 'get-url') -or
              ($GitArgs[0] -eq 'branch' -and ($GitArgs -contains '--merged' -or $GitArgs -contains '--list'))

    if ($DryRun -and -not $isRead) {
        Write-Host "  [dry-run] $line" -ForegroundColor DarkGray
        return ""
    }
    Write-Host "  > $line" -ForegroundColor Cyan
    $out = & $Git @GitArgs 2>&1
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        if ($AllowFail) { return "" }
        throw "git 执行失败（exit=$code）：$line`n$out"
    }
    return ($out | Out-String)
}

function Assert-Prereq {
    $inside = (Invoke-Git @('rev-parse', '--is-inside-work-tree') -AllowFail).Trim()
    if ($inside -ne 'true') { throw "当前目录不是 git 仓库，先在仓库根目录执行" }
}

function Get-CurrentBranch {
    return (Invoke-Git @('rev-parse', '--abbrev-ref', 'HEAD') -AllowFail).Trim()
}

function Test-RemoteBranch([string]$branch) {
    $r = (Invoke-Git @('ls-remote', '--heads', 'origin', $branch) -AllowFail)
    return ($r -match "refs/heads/$([regex]::Escape($branch))")
}

function Get-WebBase {
    $url = (Invoke-Git @('remote', 'get-url', 'origin') -AllowFail).Trim()
    if (-not $url) { return $null }
    if ($url -match 'git@github\.com:(\S+?)(\.git)?$') { return "https://github.com/$($Matches[1])" }
    if ($url -match 'https://github\.com/(\S+?)(\.git)?$') { return "https://github.com/$($Matches[1])" }
    return $null
}

function Confirm-Name {
    if (-not $Name) { throw "该子命令需要 -Name，例如 -Name goods-export（不要带 feature/ 前缀）" }
}

function Confirm-Version {
    if (-not $Version) { throw "该子命令需要 -Version，例如 -Version 1.0.0（不要带 v 前缀）" }
    if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "版本号需为 MAJOR.MINOR.PATCH，例如 1.0.0" }
}

Assert-Prereq
Write-Host "== git-flow: $Action ==" -ForegroundColor Green

switch ($Action) {
    'init' {
        if (Test-RemoteBranch 'develop') {
            Write-Host "origin/develop 已存在，跳过创建" -ForegroundColor Yellow
        }
        else {
            Invoke-Git @('switch', 'main') | Out-Null
            Invoke-Git @('pull', '--ff-only', 'origin', 'main') | Out-Null
            Invoke-Git @('switch', '-c', 'develop') | Out-Null
            Invoke-Git @('push', '-u', 'origin', 'develop') | Out-Null
        }
        Write-Host "下一步：网页 Settings → Branches，为 main 与 develop 加保护（见 04 文档 §1.1）" -ForegroundColor Yellow
        Write-Host "注意：不要勾 Require linear history（会让 release → main 的 merge commit 被拒）" -ForegroundColor Yellow
    }

    'start' {
        Confirm-Name
        $branch = "feature/$Name"
        Invoke-Git @('switch', 'develop') | Out-Null
        Invoke-Git @('pull', '--ff-only', 'origin', 'develop') | Out-Null
        Invoke-Git @('switch', '-c', $branch) | Out-Null
        Write-Host "已在 $branch 开工。提交用 feat/fix/docs(scope): 说明（04 §2）" -ForegroundColor Yellow
    }

    'release' {
        Confirm-Version
        $branch = "release/v$Version"
        Invoke-Git @('switch', 'develop') | Out-Null
        Invoke-Git @('pull', '--ff-only', 'origin', 'develop') | Out-Null
        Invoke-Git @('switch', '-c', $branch) | Out-Null
        Invoke-Git @('push', '-u', 'origin', $branch) | Out-Null
        $web = Get-WebBase
        Write-Host "release 分支只允许 fix/docs/test，不要加新功能（04 §1.4）" -ForegroundColor Yellow
        if ($web) { Write-Host "开 PR：$web/compare/main...$branch`?expand=1  → 选 Create a merge commit" -ForegroundColor Yellow }
    }

    'hotfix' {
        Confirm-Name
        $branch = "hotfix/$Name"
        Invoke-Git @('fetch', '--tags', 'origin') -AllowFail | Out-Null
        $latest = (Invoke-Git @('describe', '--tags', '--abbrev=0', 'origin/main') -AllowFail).Trim()
        if (-not $latest) { $latest = (Invoke-Git @('rev-parse', 'origin/main') -AllowFail).Trim() }
        if (-not $latest) { $latest = 'main' }
        Invoke-Git @('switch', '-c', $branch, $latest) | Out-Null
        Invoke-Git @('push', '-u', 'origin', $branch) | Out-Null
        $web = Get-WebBase
        Write-Host "hotfix 基于 $latest（发布点），不带未发布内容（04 §1.5）" -ForegroundColor Yellow
        if ($web) { Write-Host "开 PR：$web/compare/main...$branch`?expand=1  → 选 Create a merge commit" -ForegroundColor Yellow }
    }

    'pr' {
        $current = Get-CurrentBranch
        if ($current -in @('main', 'develop')) { throw "当前在 $current，主干不能直接开 PR，请切到 feature/release/hotfix 分支" }
        Invoke-Git @('push', '-u', 'origin', $current) | Out-Null
        if ($current -like 'feature/*') { $base = 'develop' }
        elseif ($current -like 'release/*' -or $current -like 'hotfix/*') { $base = 'main' }
        else { $base = 'develop' }
        $web = Get-WebBase
        Write-Host "目标分支：$base（$current → $base）" -ForegroundColor Yellow
        if ($current -like 'feature/*') {
            Write-Host "合并方式：Squash and merge（04 §1.3）" -ForegroundColor Yellow
        }
        else {
            Write-Host "合并方式：Create a merge commit（04 §1.3）" -ForegroundColor Yellow
        }
        if ($web) { Write-Host "开 PR：$web/compare/$base...$current`?expand=1" -ForegroundColor Yellow }
        else { Write-Host "未识别 origin 的 GitHub 地址，请手动到仓库页面开 PR" -ForegroundColor Yellow }
        Write-Host "PR 描述请贴自测结论并写 Closes #<issue>（04 §1.2）" -ForegroundColor Yellow
    }

    'backmerge' {
        if (-not (Test-RemoteBranch 'main')) { throw "origin/main 不存在" }
        Invoke-Git @('switch', 'develop') | Out-Null
        Invoke-Git @('pull', '--ff-only', 'origin', 'develop') | Out-Null
        Invoke-Git @('merge', '--no-ff', 'origin/main', '-m', 'chore(release): 回灌 main 到 develop') | Out-Null
        Invoke-Git @('push', 'origin', 'develop') | Out-Null
        Write-Host "回灌完成：main → develop（04 §1.4 ④）" -ForegroundColor Yellow
    }

    'tag' {
        Confirm-Version
        $current = Get-CurrentBranch
        if ($current -ne 'main') { throw "Tag 只能打在 main 上，当前是 $current" }
        Invoke-Git @('pull', '--ff-only', 'origin', 'main') | Out-Null
        Invoke-Git @('tag', '-a', "v$Version", '-m', "发布 v$Version") | Out-Null
        Invoke-Git @('push', 'origin', "v$Version") | Out-Null
        Write-Host "已打 tag v$Version，去网页 Releases → Draft a new release 选该 tag 写变更摘要" -ForegroundColor Yellow
    }

    'finish' {
        $current = Get-CurrentBranch
        if ($current -in @('main', 'develop')) { throw "当前在 $current，无需收尾" }
        if ($current -like 'feature/*') {
            Invoke-Git @('switch', 'develop') | Out-Null
            Invoke-Git @('pull', '--ff-only', 'origin', 'develop') | Out-Null
        }
        else {
            Invoke-Git @('switch', 'main') | Out-Null
            Invoke-Git @('pull', '--ff-only', 'origin', 'main') | Out-Null
            Write-Host "release/hotfix 收尾别忘了 .\scripts\git-flow.ps1 backmerge" -ForegroundColor Yellow
        }
        Invoke-Git @('branch', '-d', $current) -AllowFail | Out-Null
        Invoke-Git @('push', 'origin', '--delete', $current) -AllowFail | Out-Null
        Write-Host "已删除本地与远端分支 $current" -ForegroundColor Yellow
    }

    'status' {
        Write-Host "当前分支：$((Get-CurrentBranch))" -ForegroundColor Yellow
        Invoke-Git @('fetch', '--all', '--prune') -AllowFail | Out-Null
        Write-Host "== 与 origin 的差异（0 0 表示已同步）=="
        Write-Host ((Invoke-Git @('rev-list', '--left-right', '--count', 'develop...origin/develop') -AllowFail).Trim())
        Write-Host ((Invoke-Git @('rev-list', '--left-right', '--count', 'main...origin/main') -AllowFail).Trim())
        Write-Host "== 最近 15 条图 =="
        Write-Host (Invoke-Git @('log', '--graph', '--oneline', '--decorate', '--all', '-15'))
        Write-Host "== 未跟踪 / 未提交 =="
        Write-Host (Invoke-Git @('status', '--short'))
    }

    'clean' {
        Invoke-Git @('fetch', '--all', '--prune') -AllowFail | Out-Null
        $merged = (Invoke-Git @('branch', '--merged', 'develop') -AllowFail) -split "`n" |
            ForEach-Object { $_.Trim().TrimStart('*').Trim() } |
            Where-Object { $_ -and $_ -notin @('main', 'develop') -and $_ -match '^(feature|release|hotfix)/' }
        if (-not $merged) {
            Write-Host "没有可清理的分支" -ForegroundColor Yellow
        }
        else {
            foreach ($b in $merged) {
                Write-Host "删除已合并分支：$b" -ForegroundColor Yellow
                Invoke-Git @('branch', '-d', $b) -AllowFail | Out-Null
                Invoke-Git @('push', 'origin', '--delete', $b) -AllowFail | Out-Null
            }
        }
    }
}

Write-Host "done." -ForegroundColor Green
