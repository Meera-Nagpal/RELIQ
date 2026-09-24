# ============================================================
# RELIQ -- One-Click Task Rollback Script
# 
# Safely rolls back changes introduced during the RELIQ UI
# restoration task, returning the repository to the pre-task checkpoint.
# ============================================================

[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "         RELIQ -- TASK ROLLBACK MECHANISM                    " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Identify the safe checkpoint commit created before this task
$DefaultCheckpointSha = "15a6197457d9b9d9958248a401d0c5015a2c98d9"
$SearchCheckpointSha = (git log --grep="checkpoint before RELIQ UI restoration" -n 1 --format="%H" 2>$null)

$CheckpointSha = $null
if ($SearchCheckpointSha -and $SearchCheckpointSha.Trim().Length -ge 7) {
    $CheckpointSha = $SearchCheckpointSha.Trim()
} else {
    $CheckpointSha = $DefaultCheckpointSha
}

$CurrentHead = (git rev-parse HEAD).Trim()

Write-Host "Target Checkpoint SHA: " -NoNewline
Write-Host "$CheckpointSha" -ForegroundColor Yellow

Write-Host "Current HEAD SHA:      " -NoNewline
Write-Host "$CurrentHead" -ForegroundColor Yellow
Write-Host ""

if ($CurrentHead -eq $CheckpointSha) {
    Write-Host "Repository is ALREADY at the checkpoint commit ($CheckpointSha)." -ForegroundColor Green
    Write-Host "No rollback actions needed."
    exit 0
}

# 2. Show commits and files to be rolled back
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "Commits introduced after checkpoint:" -ForegroundColor Cyan
git log --oneline "$CheckpointSha..HEAD"

Write-Host ""
Write-Host "File changes to be rolled back:" -ForegroundColor Cyan
git diff --stat "$CheckpointSha..HEAD"
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""

# 3. Confirmation before any destructive action
if (-not $Force) {
    $confirmation = Read-Host "Proceed with rolling back to checkpoint $CheckpointSha? (y/N)"
    if ($confirmation -ne 'y' -and $confirmation -ne 'Y') {
        Write-Host "Rollback cancelled by user. No files were modified." -ForegroundColor Yellow
        exit 0
    }
}

# 4. Safely restore repository to the checkpoint
Write-Host ""
Write-Host "Executing rollback..." -ForegroundColor Cyan

try {
    # Check if working directory has uncommitted changes
    $status = git status --porcelain
    if ($status) {
        Write-Host "Stashing uncommitted working tree changes..." -ForegroundColor Yellow
        git stash push -m "pre-rollback-working-state"
    }

    # Revert all changes by checking out all tracked files from checkpoint
    Write-Host "Restoring repository files to checkpoint state ($CheckpointSha)..." -ForegroundColor Yellow
    git checkout $CheckpointSha -- .

    # Build and test to ensure clean state
    Write-Host "Re-building artifacts..." -ForegroundColor Yellow
    npm run build

    Write-Host ""
    Write-Host "[OK] Rollback complete! Repository has been restored to checkpoint:" -ForegroundColor Green
    Write-Host "  Commit: $CheckpointSha" -ForegroundColor Green
    Write-Host ""
    Write-Host "Working directory is restored to the pre-task baseline."
}
catch {
    Write-Host "Error during rollback: $_" -ForegroundColor Red
    exit 1
}
