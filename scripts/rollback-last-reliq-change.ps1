# ============================================================
# RELIQ -- One-Click Task Rollback Script
#
# Safely reverts ALL commits created after the RELIQ UI
# restoration checkpoint.
#
# This preserves Git history and creates a new rollback commit.
# ============================================================

[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "          RELIQ -- TASK ROLLBACK MECHANISM                  " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ------------------------------------------------------------
# 1. Find checkpoint
# ------------------------------------------------------------

$CheckpointMessage = "checkpoint before RELIQ UI restoration"

$CheckpointSha = (
    git log --grep="$CheckpointMessage" -n 1 --format="%H" 2>$null
).Trim()

if (-not $CheckpointSha) {
    Write-Host "[ERROR] Could not find the checkpoint commit." -ForegroundColor Red
    Write-Host ""
    Write-Host "Expected commit message:" -ForegroundColor Yellow
    Write-Host "  $CheckpointMessage"
    exit 1
}

$CurrentHead = (git rev-parse HEAD).Trim()
$CurrentBranch = (git branch --show-current).Trim()

Write-Host "Current branch:        " -NoNewline
Write-Host "$CurrentBranch" -ForegroundColor Yellow

Write-Host "Checkpoint SHA:        " -NoNewline
Write-Host "$CheckpointSha" -ForegroundColor Yellow

Write-Host "Current HEAD:          " -NoNewline
Write-Host "$CurrentHead" -ForegroundColor Yellow

Write-Host ""

# ------------------------------------------------------------
# 2. Safety: only allow rollback from main
# ------------------------------------------------------------

if ($CurrentBranch -ne "main") {
    Write-Host "[ERROR] Rollback must be run from the main branch." -ForegroundColor Red
    Write-Host "Current branch: $CurrentBranch"
    exit 1
}

# ------------------------------------------------------------
# 3. Check whether rollback is necessary
# ------------------------------------------------------------

if ($CurrentHead -eq $CheckpointSha) {
    Write-Host "[OK] Repository is already at the checkpoint." -ForegroundColor Green
    Write-Host "Nothing to roll back."
    exit 0
}

# ------------------------------------------------------------
# 4. Make sure the checkpoint is actually an ancestor
# ------------------------------------------------------------

$AncestorCheck = git merge-base --is-ancestor $CheckpointSha $CurrentHead
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Checkpoint is not an ancestor of current HEAD." -ForegroundColor Red
    Write-Host "Refusing to perform unsafe rollback."
    exit 1
}

# ------------------------------------------------------------
# 5. Show exactly what will be reverted
# ------------------------------------------------------------

Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "COMMITS TO BE ROLLED BACK:" -ForegroundColor Cyan
git log --oneline "$CheckpointSha..HEAD"

Write-Host ""
Write-Host "FILES AFFECTED:" -ForegroundColor Cyan
git diff --stat "$CheckpointSha..HEAD"

Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""

# ------------------------------------------------------------
# 6. Working tree safety
# ------------------------------------------------------------

$Status = git status --porcelain

if ($Status) {
    Write-Host "[ERROR] Working tree contains uncommitted changes." -ForegroundColor Red
    Write-Host ""
    Write-Host "Commit or stash those changes before rollback." -ForegroundColor Yellow
    Write-Host ""
    git status --short
    exit 1
}

# ------------------------------------------------------------
# 7. Confirmation
# ------------------------------------------------------------

if (-not $Force) {

    Write-Host ""
    Write-Host "WARNING:" -ForegroundColor Red
    Write-Host "This will create a new Git commit that reverses ALL"
    Write-Host "commits after the RELIQ UI restoration checkpoint."
    Write-Host ""

    $Confirmation = Read-Host "Type ROLLBACK to continue"

    if ($Confirmation -ne "ROLLBACK") {
        Write-Host ""
        Write-Host "Rollback cancelled. No files were modified." -ForegroundColor Yellow
        exit 0
    }
}

# ------------------------------------------------------------
# 8. Create rollback commit
# ------------------------------------------------------------

Write-Host ""
Write-Host "Starting rollback..." -ForegroundColor Cyan
Write-Host ""

try {

    Write-Host "[1/4] Reverting changes after checkpoint..." -ForegroundColor Yellow

    git revert --no-commit "$CheckpointSha..HEAD"

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[ERROR] Git revert encountered a conflict." -ForegroundColor Red
        Write-Host ""
        Write-Host "Rollback has NOT been committed." -ForegroundColor Yellow
        Write-Host "Run:"
        Write-Host "  git status"
        Write-Host ""
        Write-Host "Resolve the conflict or abort with:"
        Write-Host "  git revert --abort"
        exit 1
    }

    Write-Host "[2/4] Creating rollback commit..." -ForegroundColor Yellow

    git commit -m "rollback RELIQ UI restoration task"

    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Could not create rollback commit." -ForegroundColor Red
        exit 1
    }

    Write-Host "[3/4] Verifying repository state..." -ForegroundColor Yellow

    $NewHead = (git rev-parse HEAD).Trim()

    Write-Host ""
    Write-Host "Rollback commit: $NewHead" -ForegroundColor Green

    Write-Host ""
    Write-Host "[4/4] Running production build..." -ForegroundColor Yellow

    npm run build

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "[WARNING] Rollback commit exists, but build failed." -ForegroundColor Yellow
        Write-Host "Review the build output before pushing."
        exit 1
    }

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "                 ROLLBACK COMPLETE                          " -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host ""

    Write-Host "Checkpoint:" -ForegroundColor Cyan
    Write-Host "  $CheckpointSha"

    Write-Host ""
    Write-Host "Rollback commit:" -ForegroundColor Cyan
    Write-Host "  $NewHead"

    Write-Host ""
    Write-Host "Build:" -ForegroundColor Green
    Write-Host "  PASS"

    Write-Host ""
    Write-Host "IMPORTANT:" -ForegroundColor Yellow
    Write-Host "The rollback has NOT been pushed automatically."
    Write-Host ""
    Write-Host "If everything looks correct, run:" -ForegroundColor Cyan
    Write-Host "  git push origin main" -ForegroundColor White
    Write-Host ""

}
catch {

    Write-Host ""
    Write-Host "[ERROR] Rollback failed:" -ForegroundColor Red
    Write-Host $_
    Write-Host ""

    Write-Host "Check repository state with:" -ForegroundColor Yellow
    Write-Host "  git status"

    exit 1
}
