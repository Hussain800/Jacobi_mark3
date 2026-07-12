param(
  [string]$Output = "dist/jacobi-extension.zip"
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$extension = (Resolve-Path (Join-Path $repo "extension")).Path
$outputPath = [System.IO.Path]::GetFullPath((Join-Path $repo $Output))
$dist = [System.IO.Path]::GetDirectoryName($outputPath)
if (-not $outputPath.StartsWith($repo, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Output must remain inside the repository"
}

New-Item -ItemType Directory -Path $dist -Force | Out-Null
if (Test-Path -LiteralPath $outputPath) {
  Remove-Item -LiteralPath $outputPath -Force
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open(
  $outputPath,
  [System.IO.Compression.ZipArchiveMode]::Create
)
try {
  $files = Get-ChildItem -LiteralPath $extension -Recurse -File | Where-Object {
    $relative = $_.FullName.Substring($extension.Length).TrimStart('\', '/')
    -not ($relative -match '^(tests|artifacts)([\\/]|$)') -and
    $relative -ne 'README.md'
  }
  foreach ($file in $files) {
    $relative = $file.FullName.Substring($extension.Length).TrimStart('\', '/').Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive,
      $file.FullName,
      $relative,
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  $archive.Dispose()
}

Write-Output $outputPath
