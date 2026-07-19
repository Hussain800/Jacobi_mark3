[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string]$ApiOrigin,

  [Parameter(Mandatory = $true)]
  [ValidateCount(1, 32)]
  [string[]]$SupportedSiteOrigin,

  [string]$Output = "dist/jacobi-extension.zip"
)

$ErrorActionPreference = "Stop"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$FixedZipTime = [DateTimeOffset]::new(1980, 1, 1, 0, 0, 0, [TimeSpan]::Zero)

$ReviewedFiles = @(
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

function ConvertTo-ExactOrigin {
  param(
    [Parameter(Mandatory = $true)][string]$Value,
    [Parameter(Mandatory = $true)][string]$Label
  )

  try {
    $uri = [Uri]::new($Value, [UriKind]::Absolute)
  } catch {
    throw "$Label must be an absolute HTTP(S) origin: $Value"
  }
  if ($uri.Scheme -notin @("http", "https")) {
    throw "$Label must use http or https: $Value"
  }
  if ($uri.UserInfo) {
    throw "$Label must not contain credentials: $Value"
  }
  if ($uri.Query -or $uri.Fragment -or $uri.AbsolutePath -ne "/") {
    throw "$Label must be an origin without path, query, or fragment: $Value"
  }
  if (-not $uri.Host -or $uri.Host.Contains("*")) {
    throw "$Label must name one exact host: $Value"
  }
  $isLocal = $uri.IsLoopback -or $uri.DnsSafeHost -eq "localhost"
  if ($uri.Scheme -eq "http" -and -not $isLocal) {
    throw "$Label must use https unless it is a loopback development origin: $Value"
  }

  $originHost = $uri.DnsSafeHost.ToLowerInvariant()
  $patternHost = if ($originHost.Contains(":")) { "[$originHost]" } else { $originHost }
  [PSCustomObject]@{
    BaseUrl = $uri.GetLeftPart([UriPartial]::Authority).TrimEnd("/")
    Pattern = "$($uri.Scheme.ToLowerInvariant())://$patternHost/*"
  }
}

function ConvertTo-JsonString {
  param([Parameter(Mandatory = $true)][string]$Value)
  return ConvertTo-Json -InputObject $Value -Compress
}

function Assert-PathInsideRepository {
  param(
    [Parameter(Mandatory = $true)][string]$Repository,
    [Parameter(Mandatory = $true)][string]$Candidate,
    [Parameter(Mandatory = $true)][string]$Label
  )
  $root = [System.IO.Path]::GetFullPath($Repository).TrimEnd('\', '/')
  $path = [System.IO.Path]::GetFullPath($Candidate)
  $prefix = $root + [System.IO.Path]::DirectorySeparatorChar
  if (-not $path.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "$Label must remain inside the repository: $path"
  }
  return $path
}

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$extension = (Resolve-Path (Join-Path $repo "extension")).Path
$rawOutputPath = if ([System.IO.Path]::IsPathRooted($Output)) {
  $Output
} else {
  Join-Path $repo $Output
}
$outputPath = Assert-PathInsideRepository -Repository $repo -Candidate $rawOutputPath -Label "Output"
$dist = [System.IO.Path]::GetDirectoryName($outputPath)
$stageCandidate = Join-Path $dist (".jacobi-extension-stage-" + [Guid]::NewGuid().ToString("N"))
$stage = Assert-PathInsideRepository -Repository $repo -Candidate $stageCandidate -Label "Staging directory"

$api = ConvertTo-ExactOrigin -Value $ApiOrigin -Label "API origin"
$siteOrigins = @(
  $SupportedSiteOrigin | ForEach-Object {
    ConvertTo-ExactOrigin -Value $_ -Label "Supported-site origin"
  }
)
$sitePatterns = [string[]]@($siteOrigins.Pattern | Sort-Object -Unique)
$permissionPatterns = [string[]]@(($sitePatterns + $api.Pattern) | Sort-Object -Unique)

foreach ($pattern in $permissionPatterns) {
  if ($pattern -in @("<all_urls>", "http://*/*", "https://*/*") -or $pattern -match '^[a-z]+://\*') {
    throw "Broad host permission is prohibited: $pattern"
  }
}

New-Item -ItemType Directory -Path $dist -Force | Out-Null
if (Test-Path -LiteralPath $outputPath) {
  Remove-Item -LiteralPath $outputPath -Force
}
New-Item -ItemType Directory -Path $stage -Force | Out-Null

try {
  foreach ($relative in $ReviewedFiles) {
    $platformRelative = $relative.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    $source = Join-Path $extension $platformRelative
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
      throw "Reviewed extension file is missing: $relative"
    }
    $destination = Join-Path $stage $platformRelative
    $destinationDirectory = [System.IO.Path]::GetDirectoryName($destination)
    New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
    $text = [System.IO.File]::ReadAllText($source).Replace("`r`n", "`n").Replace("`r", "`n")
    [System.IO.File]::WriteAllText($destination, $text, $Utf8NoBom)
  }

  $manifestPath = Join-Path $stage "manifest.json"
  $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $manifest.optional_host_permissions = @($permissionPatterns)
  $manifestJson = ($manifest | ConvertTo-Json -Depth 20) + "`n"
  [System.IO.File]::WriteAllText($manifestPath, $manifestJson, $Utf8NoBom)

  $configPath = Join-Path $stage ("shared" + [System.IO.Path]::DirectorySeparatorChar + "config.js")
  $config = [System.IO.File]::ReadAllText($configPath)
  $siteBlockPattern = 'const TRAVEL_SITE_ORIGINS = Object\.freeze\(\[[\s\S]*?\]\);'
  if ([Regex]::Matches($config, $siteBlockPattern).Count -ne 1) {
    throw "Could not identify exactly one TRAVEL_SITE_ORIGINS block"
  }
  $siteLines = @($sitePatterns | ForEach-Object { "    " + (ConvertTo-JsonString $_) + "," })
  $siteBlock = "const TRAVEL_SITE_ORIGINS = Object.freeze([`n" + ($siteLines -join "`n") + "`n  ]);"
  $config = [Regex]::Replace($config, $siteBlockPattern, $siteBlock)

  $apiPattern = 'apiBackendUrl:\s*"[^"]*"'
  if ([Regex]::Matches($config, $apiPattern).Count -ne 1) {
    throw "Could not identify exactly one default API URL"
  }
  $config = [Regex]::Replace(
    $config,
    $apiPattern,
    "apiBackendUrl: " + (ConvertTo-JsonString $api.BaseUrl)
  )
  [System.IO.File]::WriteAllText($configPath, $config, $Utf8NoBom)

  $generatedManifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($generatedManifest.manifest_version -ne 3) {
    throw "Generated package must remain Manifest V3"
  }
  if ($generatedManifest.PSObject.Properties.Name -contains "host_permissions") {
    throw "Generated package must not add install-time host permissions"
  }
  $generatedPermissions = [string[]]@($generatedManifest.optional_host_permissions)
  if (Compare-Object -ReferenceObject $permissionPatterns -DifferenceObject $generatedPermissions) {
    throw "Generated optional host permissions do not match the reviewed origins"
  }
  foreach ($pattern in $generatedPermissions) {
    if ($pattern -in @("<all_urls>", "http://*/*", "https://*/*") -or $pattern -match '^[a-z]+://\*') {
      throw "Generated manifest contains a broad host permission: $pattern"
    }
  }
  foreach ($required in @(
    $generatedManifest.background.service_worker,
    $generatedManifest.side_panel.default_path,
    $generatedManifest.options_ui.page
  )) {
    if (-not (Test-Path -LiteralPath (Join-Path $stage $required) -PathType Leaf)) {
      throw "Generated manifest references a missing packaged file: $required"
    }
  }

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::Open(
    $outputPath,
    [System.IO.Compression.ZipArchiveMode]::Create
  )
  try {
    $entryPaths = [string[]]@(
      Get-ChildItem -LiteralPath $stage -Recurse -File | ForEach-Object {
        $_.FullName.Substring($stage.Length).TrimStart('\', '/').Replace('\', '/')
      }
    )
    [Array]::Sort($entryPaths, [System.StringComparer]::Ordinal)
    foreach ($relative in $entryPaths) {
      $source = Join-Path $stage $relative.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
      $entry = $archive.CreateEntry($relative, [System.IO.Compression.CompressionLevel]::Optimal)
      $entry.LastWriteTime = $FixedZipTime
      $entryStream = $entry.Open()
      $sourceStream = [System.IO.File]::OpenRead($source)
      try {
        $sourceStream.CopyTo($entryStream)
      } finally {
        $sourceStream.Dispose()
        $entryStream.Dispose()
      }
    }
  } finally {
    $archive.Dispose()
  }

  $hash = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant()
  [PSCustomObject]@{
    output = $outputPath
    sha256 = $hash
    manifest_version = 3
    api_origin = $api.BaseUrl
    supported_site_origins = @($siteOrigins.BaseUrl | Sort-Object -Unique)
    optional_host_permissions = @($permissionPatterns)
    reviewed_file_count = $ReviewedFiles.Count
  } | ConvertTo-Json -Depth 5 -Compress
} finally {
  if (Test-Path -LiteralPath $stage) {
    $verifiedStage = Assert-PathInsideRepository -Repository $repo -Candidate $stage -Label "Staging directory"
    Remove-Item -LiteralPath $verifiedStage -Recurse -Force
  }
}
