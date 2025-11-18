# D365 Auto-Recorder Release Script
# Automates the process of creating a GitHub release

param(
    [string]$Version = "",
    [string]$ReleaseNotes = "",
    [switch]$SkipBuild = $false,
    [switch]$SkipTag = $false
)

$ErrorActionPreference = "Stop"

# Get version from package.json if not provided
if ([string]::IsNullOrEmpty($Version)) {
    $packageJson = Get-Content "package.json" | ConvertFrom-Json
    $Version = $packageJson.version
}

$TagName = "v$Version"
$ReleaseTitle = "$TagName - D365 Auto-Recorder & POM Generator"
$ReleaseZip = "release.zip"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "D365 Auto-Recorder Release Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Version: $Version" -ForegroundColor Yellow
Write-Host "Tag: $TagName" -ForegroundColor Yellow
Write-Host ""

# Step 1: Check if release.zip exists
if (-not (Test-Path $ReleaseZip)) {
    Write-Host "⚠️  $ReleaseZip not found. Building application..." -ForegroundColor Yellow
    $SkipBuild = $false
}

# Step 2: Build application (if needed)
if (-not $SkipBuild) {
    Write-Host "📦 Building application..." -ForegroundColor Cyan
    npm run build:app
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed!" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "📦 Creating Windows package..." -ForegroundColor Cyan
    npm run dist:win
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Package creation failed!" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "📦 Packaging as portable ZIP..." -ForegroundColor Cyan
    npm run package:portable
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Packaging failed!" -ForegroundColor Red
        exit 1
    }
    
    # Copy the packaged file to root as release.zip
    $PackagedZip = "release\D365-Auto-Recorder-portable.zip"
    if (Test-Path $PackagedZip) {
        Copy-Item $PackagedZip -Destination $ReleaseZip -Force
        Write-Host "✅ Release package created: $ReleaseZip" -ForegroundColor Green
    } else {
        Write-Host "❌ Packaged ZIP not found at $PackagedZip" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "⏭️  Skipping build (using existing $ReleaseZip)" -ForegroundColor Yellow
}

# Step 3: Check git status
Write-Host ""
Write-Host "🔍 Checking git status..." -ForegroundColor Cyan
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "⚠️  You have uncommitted changes:" -ForegroundColor Yellow
    Write-Host $gitStatus
    $response = Read-Host "Continue anyway? (y/N)"
    if ($response -ne "y" -and $response -ne "Y") {
        Write-Host "❌ Aborted" -ForegroundColor Red
        exit 1
    }
}

# Step 4: Create and push git tag
if (-not $SkipTag) {
    Write-Host ""
    Write-Host "🏷️  Creating git tag: $TagName" -ForegroundColor Cyan
    
    # Check if tag already exists
    $existingTag = git tag -l $TagName
    if ($existingTag) {
        Write-Host "⚠️  Tag $TagName already exists" -ForegroundColor Yellow
        $response = Read-Host "Delete and recreate? (y/N)"
        if ($response -eq "y" -or $response -eq "Y") {
            git tag -d $TagName
            git push origin :refs/tags/$TagName 2>$null
        } else {
            Write-Host "⏭️  Using existing tag" -ForegroundColor Yellow
        }
    }
    
    if (-not (git tag -l $TagName)) {
        git tag -a $TagName -m $ReleaseTitle
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Failed to create tag!" -ForegroundColor Red
            exit 1
        }
        Write-Host "✅ Tag created: $TagName" -ForegroundColor Green
    }
    
    Write-Host "📤 Pushing tag to remote..." -ForegroundColor Cyan
    git push origin $TagName
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to push tag!" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Tag pushed to remote" -ForegroundColor Green
} else {
    Write-Host "⏭️  Skipping tag creation" -ForegroundColor Yellow
}

# Step 5: Create GitHub release
Write-Host ""
Write-Host "🚀 Creating GitHub release..." -ForegroundColor Cyan

# Check if GitHub CLI is installed
$ghInstalled = Get-Command gh -ErrorAction SilentlyContinue

if ($ghInstalled) {
    Write-Host "✅ GitHub CLI found. Creating release..." -ForegroundColor Green
    
    # Prepare release notes
    if ([string]::IsNullOrEmpty($ReleaseNotes)) {
        $ReleaseNotes = @"
## D365 Auto-Recorder & POM Generator $TagName

### Installation
1. Download \`$ReleaseZip\` from the assets below
2. Extract to your desired location
3. Run \`D365 Auto Recorder & POM Generator.exe\`
4. Complete the first-run setup wizard

### Features
- Interactive recording of D365 user interactions
- Automatic POM and test specification generation
- Standalone Windows application (no Node.js required)
- Persistent configuration and authentication

See [README.md](README.md) for detailed documentation.
"@
    }
    
    # Create release with GitHub CLI
    gh release create $TagName `
        $ReleaseZip `
        --title $ReleaseTitle `
        --notes $ReleaseNotes
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Release created successfully!" -ForegroundColor Green
        Write-Host "🔗 View release: https://github.com/zkyko/D365-Recorder/releases/tag/$TagName" -ForegroundColor Cyan
    } else {
        Write-Host "❌ Failed to create release with GitHub CLI" -ForegroundColor Red
        Write-Host "💡 You can create it manually on GitHub" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️  GitHub CLI (gh) not found" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To install GitHub CLI:" -ForegroundColor Cyan
    Write-Host "  winget install --id GitHub.cli" -ForegroundColor White
    Write-Host ""
    Write-Host "Or create the release manually:" -ForegroundColor Cyan
    Write-Host "  1. Go to: https://github.com/zkyko/D365-Recorder/releases/new" -ForegroundColor White
    Write-Host "  2. Select tag: $TagName" -ForegroundColor White
    Write-Host "  3. Title: $ReleaseTitle" -ForegroundColor White
    Write-Host "  4. Upload: $ReleaseZip" -ForegroundColor White
    Write-Host "  5. Click 'Publish release'" -ForegroundColor White
    Write-Host ""
    Write-Host "📦 Release file ready: $ReleaseZip" -ForegroundColor Green
    Write-Host "🏷️  Tag created: $TagName" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Release process complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

