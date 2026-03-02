param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$SourcePath
)

$resolvedSource = Resolve-Path -LiteralPath $SourcePath -ErrorAction Stop
$repoRoot = Split-Path -Parent $PSScriptRoot
$prebuiltDir = Join-Path $repoRoot 'prebuilt'
$destinationPath = Join-Path $prebuiltDir 'lorcana.db'

New-Item -ItemType Directory -Path $prebuiltDir -Force | Out-Null
Copy-Item -LiteralPath $resolvedSource -Destination $destinationPath -Force

$walPath = "$($resolvedSource.Path)-wal"
$shmPath = "$($resolvedSource.Path)-shm"

if ((Test-Path -LiteralPath $walPath) -or (Test-Path -LiteralPath $shmPath)) {
    Write-Warning 'The source database still has -wal or -shm sidecar files. Checkpoint and close it first or the staged snapshot may be incomplete.'
}

$stagedFile = Get-Item -LiteralPath $destinationPath
$sizeMb = [Math]::Round($stagedFile.Length / 1MB, 2)

Write-Host "Staged Lorcana database to $destinationPath ($sizeMb MB)."
Write-Host 'Android builds will package it as android/app/src/main/assets/www/lorcana.db.'
