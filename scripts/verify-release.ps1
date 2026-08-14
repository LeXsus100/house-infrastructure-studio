[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,

  [string]$ChecksumPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$releaseInstallerPath = (Resolve-Path -LiteralPath $InstallerPath).Path
if (-not $ChecksumPath) { $ChecksumPath = "$releaseInstallerPath.sha256" }
$releaseChecksumPath = (Resolve-Path -LiteralPath $ChecksumPath).Path
$releaseChecksumLine = (Get-Content -LiteralPath $releaseChecksumPath -Raw).Trim()
$releaseChecksumMatch = [regex]::Match($releaseChecksumLine, '^(?<hash>[A-Fa-f0-9]{64})\s+\*?(?<file>[^\r\n]+)$')

if (-not $releaseChecksumMatch.Success) {
  throw 'The checksum file must contain one SHA-256 hash followed by the installer filename.'
}

$releaseExpectedFile = $releaseChecksumMatch.Groups['file'].Value
$releaseActualFile = [System.IO.Path]::GetFileName($releaseInstallerPath)
if (-not $releaseExpectedFile.Equals($releaseActualFile, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "The checksum is for '$releaseExpectedFile', not '$releaseActualFile'."
}

$releaseExpectedHash = $releaseChecksumMatch.Groups['hash'].Value
$releaseActualHash = (Get-FileHash -LiteralPath $releaseInstallerPath -Algorithm SHA256).Hash
if (-not $releaseExpectedHash.Equals($releaseActualHash, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "SHA-256 verification failed for '$releaseActualFile'. Do not run this installer."
}

Write-Host "SHA-256 verified: $releaseActualFile"
