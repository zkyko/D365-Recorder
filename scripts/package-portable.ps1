# Package D365 Auto-Recorder as portable ZIP
# Run this after building with: npm run build:app

$ErrorActionPreference = "Stop"

Write-Host "Packaging D365 Auto-Recorder as portable application..." -ForegroundColor Green

# Check if win-unpacked exists
$unpackedPath = "release\win-unpacked"
if (-not (Test-Path $unpackedPath)) {
    Write-Host "Error: $unpackedPath not found. Run 'npm run build:app' first." -ForegroundColor Red
    exit 1
}

# Check if executable is running
$exePath = Join-Path $unpackedPath "D365 Auto Recorder & POM Generator.exe"
if (Get-Process | Where-Object { $_.Path -eq (Resolve-Path $exePath).Path }) {
    Write-Host "Warning: The application is currently running. Please close it first." -ForegroundColor Yellow
    Write-Host "Press any key to continue anyway, or Ctrl+C to cancel..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

# Create portable folder name
$portableFolder = "D365-Auto-Recorder-portable"
$portablePath = "release\$portableFolder"

# Remove old portable folder if exists
if (Test-Path $portablePath) {
    Write-Host "Removing old portable folder..." -ForegroundColor Yellow
    Remove-Item -Path $portablePath -Recurse -Force
}

# Copy win-unpacked to portable folder
Write-Host "Copying files to portable folder..." -ForegroundColor Green
Copy-Item -Path $unpackedPath -Destination $portablePath -Recurse

# Copy README
if (Test-Path "release\README.txt") {
    Copy-Item -Path "release\README.txt" -Destination $portablePath -Force
    Write-Host "Added README.txt to portable folder" -ForegroundColor Green
}

# Create ZIP
$zipPath = "release\$portableFolder.zip"
if (Test-Path $zipPath) {
    Remove-Item -Path $zipPath -Force
}

Write-Host "Creating ZIP archive..." -ForegroundColor Green
Compress-Archive -Path $portablePath -DestinationPath $zipPath -Force

Write-Host ""
Write-Host "✓ Portable package created successfully!" -ForegroundColor Green
Write-Host "  Location: $zipPath" -ForegroundColor Cyan
Write-Host "  Size: $([math]::Round((Get-Item $zipPath).Length / 1MB, 2)) MB" -ForegroundColor Cyan
Write-Host ""
Write-Host "To distribute:" -ForegroundColor Yellow
Write-Host "  1. Share the ZIP file: $zipPath" -ForegroundColor White
Write-Host "  2. Recipients unzip it anywhere" -ForegroundColor White
Write-Host "  3. Run: D365 Auto Recorder & POM Generator.exe" -ForegroundColor White
Write-Host ""

