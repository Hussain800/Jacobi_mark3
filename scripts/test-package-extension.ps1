[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$packageScript = Join-Path $PSScriptRoot "package-extension.ps1"
$firstRelative = "dist/package-contract-a.zip"
$secondRelative = "dist/package-contract-b.zip"
$first = Join-Path $repo $firstRelative.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
$second = Join-Path $repo $secondRelative.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
$inspect = Join-Path $repo "dist/package-contract-inspect"

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

function Assert-PackageRejected {
  param(
    [string]$ApiOrigin,
    [string[]]$SupportedSiteOrigin,
    [string]$ExpectedMessage
  )
  $failed = $false
  try {
    & $packageScript `
      -ApiOrigin $ApiOrigin `
      -SupportedSiteOrigin $SupportedSiteOrigin `
      -Output "dist/package-contract-rejected.zip" | Out-Null
  } catch {
    $failed = $_.Exception.Message.Contains($ExpectedMessage)
  }
  Assert-True $failed "Expected package rejection containing: $ExpectedMessage"
}

foreach ($path in @($first, $second, $inspect, (Join-Path $repo "dist/package-contract-rejected.zip"))) {
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Recurse -Force
  }
}

try {
  $arguments = @{
    ApiOrigin = "https://api.release.invalid"
    SupportedSiteOrigin = @(
      "https://flights.release.invalid",
      "https://hotels.release.invalid"
    )
  }
  & $packageScript @arguments -Output $firstRelative | Out-Null
  & $packageScript @arguments -Output $secondRelative | Out-Null

  $firstHash = (Get-FileHash -LiteralPath $first -Algorithm SHA256).Hash
  $secondHash = (Get-FileHash -LiteralPath $second -Algorithm SHA256).Hash
  Assert-True ($firstHash -eq $secondHash) "Identical inputs must produce byte-identical ZIP archives"

  Expand-Archive -LiteralPath $first -DestinationPath $inspect
  $manifest = Get-Content -LiteralPath (Join-Path $inspect "manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
  $expectedPermissions = [string[]]@(
    "https://api.release.invalid/*",
    "https://flights.release.invalid/*",
    "https://hotels.release.invalid/*"
  )
  $actualPermissions = [string[]]@($manifest.optional_host_permissions)
  Assert-True (-not (Compare-Object $expectedPermissions $actualPermissions)) "Generated manifest origins differ from operator inputs"
  Assert-True ($manifest.manifest_version -eq 3) "Generated manifest must remain MV3"
  Assert-True (-not ($manifest.PSObject.Properties.Name -contains "host_permissions")) "Install-time host permissions are prohibited"
  foreach ($forbidden in @("<all_urls>", "http://*/*", "https://*/*")) {
    Assert-True ($actualPermissions -notcontains $forbidden) "Generated manifest contains prohibited permission: $forbidden"
  }

  $config = Get-Content -LiteralPath (Join-Path $inspect "shared/config.js") -Raw -Encoding UTF8
  Assert-True $config.Contains('apiBackendUrl: "https://api.release.invalid"') "Packaged API default was not injected"
  Assert-True $config.Contains('"https://flights.release.invalid/*"') "Flight origin was not injected into supported sites"
  Assert-True $config.Contains('"https://hotels.release.invalid/*"') "Hotel origin was not injected into supported sites"
  Assert-True (-not $config.Contains('"http://localhost/*"')) "Development site origin leaked into release package"

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($first)
  try {
    $expectedEntries = [string[]]@(
      "background.js",
      "content.js",
      "icons/icon128.svg",
      "icons/icon16.svg",
      "icons/icon48.svg",
      "manifest.json",
      "popup.html",
      "popup.js",
      "product-context.js",
      "settings.html",
      "settings.js",
      "shared/config.js",
      "shared/extraction.js",
      "shared/messages.js",
      "shared/travel.js",
      "sidepanel/app.js",
      "sidepanel/index.html",
      "sidepanel/render.js",
      "sidepanel/styles.css",
      "sidepanel/travel-app.js",
      "sidepanel/travel-render.js",
      "travel-context.js"
    )
    $actualEntries = [string[]]@($archive.Entries.FullName)
    Assert-True (-not (Compare-Object $expectedEntries $actualEntries)) "Package paths must exactly match the reviewed file allowlist"
    foreach ($entry in $archive.Entries) {
      Assert-True ($entry.FullName -notmatch '^(tests|artifacts)(/|$)') "Development file entered archive: $($entry.FullName)"
      Assert-True ($entry.FullName -ne "README.md") "Development README entered archive"
      Assert-True ($entry.LastWriteTime.DateTime -eq [DateTime]::new(1980, 1, 1, 0, 0, 0)) "ZIP timestamp is not deterministic: $($entry.FullName)"
    }
  } finally {
    $archive.Dispose()
  }

  Assert-PackageRejected `
    -ApiOrigin "https://api.release.invalid/path" `
    -SupportedSiteOrigin @("https://flights.release.invalid") `
    -ExpectedMessage "without path"
  Assert-PackageRejected `
    -ApiOrigin "https://api.release.invalid" `
    -SupportedSiteOrigin @("http://flights.release.invalid") `
    -ExpectedMessage "must use https"
  Assert-PackageRejected `
    -ApiOrigin "https://api.release.invalid" `
    -SupportedSiteOrigin @("https://*.release.invalid") `
    -ExpectedMessage "absolute HTTP(S) origin"

  Write-Output "PASS deterministic reviewed extension packaging ($firstHash)"
} finally {
  foreach ($path in @($first, $second, $inspect, (Join-Path $repo "dist/package-contract-rejected.zip"))) {
    if (Test-Path -LiteralPath $path) {
      $full = [System.IO.Path]::GetFullPath($path)
      $distPrefix = [System.IO.Path]::GetFullPath((Join-Path $repo "dist")).TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
      if (-not $full.StartsWith($distPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clean package-test path outside dist: $full"
      }
      Remove-Item -LiteralPath $full -Recurse -Force
    }
  }
}
