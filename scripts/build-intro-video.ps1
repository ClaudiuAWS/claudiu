#requires -Version 5.1
$ErrorActionPreference = "Stop"
$ProgressPreference = 'SilentlyContinue'

$SOURCE_VIDEO    = "C:\Users\Mihai\Downloads\2026-05-14-171407701.mp4"
$TRIM_END_SEC    = 32  # source has a "samaru on flames" outro after t=32; trim it off
$REPO_ROOT       = Split-Path -Parent $PSScriptRoot
$PUBLIC_DIR      = Join-Path $REPO_ROOT "frontend\public"
$WORK_DIR        = if (Test-Path "E:\") { "E:\claudiu-video-build" } else { Join-Path $PSScriptRoot ".video-build" }
$FRAMES_IN       = Join-Path $WORK_DIR "frames-in"
$FRAMES_OUT      = Join-Path $WORK_DIR "frames-out"
$REALESRGAN_DIR  = "C:\Users\Mihai\Tools\realesrgan"
$REALESRGAN_EXE  = Join-Path $REALESRGAN_DIR "realesrgan-ncnn-vulkan.exe"
$REALESRGAN_URL  = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip"

function Section($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Ok($t)      { Write-Host $t -ForegroundColor Green }
function Warn($t)    { Write-Host $t -ForegroundColor Yellow }

# -------- Step 0: dependency check --------
Section "Step 0: Dependency check"
foreach ($exe in @("ffmpeg", "ffprobe")) {
  if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) {
    throw "$exe not found in PATH. Install via 'winget install --id=Gyan.FFmpeg' or download from https://www.gyan.dev/ffmpeg/builds/."
  }
}
Ok "ffmpeg + ffprobe present"

if (-not (Test-Path $REALESRGAN_EXE)) {
  Warn "Real-ESRGAN not found at $REALESRGAN_EXE"
  Warn "Downloading portable binary (~43 MB) from official GitHub release..."
  if (-not (Test-Path $REALESRGAN_DIR)) { New-Item -ItemType Directory -Path $REALESRGAN_DIR -Force | Out-Null }
  $zip = Join-Path $REALESRGAN_DIR "realesrgan.zip"
  Invoke-WebRequest -Uri $REALESRGAN_URL -OutFile $zip
  Expand-Archive -Path $zip -DestinationPath $REALESRGAN_DIR -Force
  Remove-Item $zip
  if (-not (Test-Path $REALESRGAN_EXE)) {
    throw "Real-ESRGAN extraction failed. Expected exe at: $REALESRGAN_EXE"
  }
  Ok "Real-ESRGAN installed."
} else {
  Ok "Real-ESRGAN present"
}

if (-not (Test-Path $SOURCE_VIDEO)) { throw "Source video not found: $SOURCE_VIDEO" }
Ok ("Source video: {0:N1} MB" -f ((Get-Item $SOURCE_VIDEO).Length / 1MB))

# -------- Disk space check (need ~12 GB headroom on the WORK_DIR drive) --------
$driveLetter = (Split-Path -Qualifier $WORK_DIR).TrimEnd(':')
$psDrive = Get-PSDrive -Name $driveLetter
$freeGB = [math]::Round($psDrive.Free / 1GB, 1)
if ($freeGB -lt 12) {
  throw "Need at least 12 GB free on $($driveLetter): drive (have $freeGB GB). Free up space and retry."
}
Ok "Disk: $freeGB GB free on $($driveLetter): drive (work area: $WORK_DIR)"

# -------- Setup --------
if (Test-Path $WORK_DIR) { Remove-Item -Path $WORK_DIR -Recurse -Force }
New-Item -ItemType Directory -Path $FRAMES_IN  -Force | Out-Null
New-Item -ItemType Directory -Path $FRAMES_OUT -Force | Out-Null
if (-not (Test-Path $PUBLIC_DIR)) { New-Item -ItemType Directory -Path $PUBLIC_DIR -Force | Out-Null }

# -------- Step 1: Extract frames --------
Section "Step 1: Extract frames"
$framePatternIn = Join-Path $FRAMES_IN "frame_%05d.png"
ffmpeg -y -hide_banner -loglevel error -stats -i $SOURCE_VIDEO -t $TRIM_END_SEC -vsync 0 -q:v 1 $framePatternIn
$frameCount = (Get-ChildItem $FRAMES_IN -Filter "*.png").Count
Ok "Extracted $frameCount frames"

# -------- Step 2: AI upscale to 4K --------
Section "Step 2: AI upscale 2x with Real-ESRGAN (this is the slow step, ~10-15 min on RTX 4070)"
$start = Get-Date
& $REALESRGAN_EXE -i $FRAMES_IN -o $FRAMES_OUT -n realesr-animevideov3 -s 2 -f png -g 1
$elapsed = (Get-Date) - $start
$upscaledCount = (Get-ChildItem $FRAMES_OUT -Filter "*.png").Count
Ok ("Upscaled $upscaledCount frames in {0:N1} min" -f $elapsed.TotalMinutes)
Remove-Item -Path $FRAMES_IN -Recurse -Force
Ok "Cleaned source frames (freed ~1.5 GB)"

# -------- Step 3: 4K mobile master with CapCut polish --------
Section "Step 3: Encode 4K mobile master with CapCut-style polish"
$intro4k = Join-Path $PUBLIC_DIR "intro-mobile-4k.mp4"
$framePatternOut = Join-Path $FRAMES_OUT "frame_%05d.png"
$fadeOutStart = $upscaledCount - 15
$polishFilter = "fps=30,eq=contrast=1.08:saturation=1.18:brightness=0.02:gamma=0.96,curves=preset=increase_contrast,vignette=PI/5,fade=in:0:15,fade=out:${fadeOutStart}:15"
ffmpeg -y -hide_banner -loglevel error -stats `
  -framerate 30 -i $framePatternOut `
  -ss 0 -t $TRIM_END_SEC -i $SOURCE_VIDEO `
  -map 0:v -map 1:a `
  -vf $polishFilter `
  -c:v libx264 -profile:v high -level 5.1 -crf 20 -preset medium -pix_fmt yuv420p `
  -movflags +faststart `
  -c:a aac -b:a 128k -shortest `
  $intro4k
if ((Get-Item $intro4k).Length -lt 1MB) { throw "4K master encode produced an empty/tiny file. Check ffmpeg output above." }
Ok ("intro-mobile-4k.mp4: {0:N2} MB" -f ((Get-Item $intro4k).Length / 1MB))
Remove-Item -Path $FRAMES_OUT -Recurse -Force
Ok "Cleaned upscaled frames (freed ~8 GB)"

# -------- Step 4a: 1080p mobile intro --------
Section "Step 4a: Derive intro-mobile.mp4 (1080p)"
$introMobile = Join-Path $PUBLIC_DIR "intro-mobile.mp4"
ffmpeg -y -hide_banner -loglevel error -stats -i $intro4k `
  -vf "scale=1080:1920:flags=lanczos" `
  -c:v libx264 -profile:v high -crf 22 -preset medium -pix_fmt yuv420p `
  -movflags +faststart `
  -c:a aac -b:a 128k `
  $introMobile
Ok ("intro-mobile.mp4: {0:N2} MB" -f ((Get-Item $introMobile).Length / 1MB))

# -------- Step 4b: Looping bg-mobile (12s segment, no audio, fade-loop seam) --------
# Single portrait video used everywhere; CSS object-fit:cover handles responsive zoom/crop on landscape viewports.
Section "Step 4b: Build looping bg-login-mobile.mp4 (12s, 1080p, no audio)"
$bgMobile = Join-Path $PUBLIC_DIR "bg-login-mobile.mp4"
ffmpeg -y -hide_banner -loglevel error -stats -i $introMobile -ss 8 -t 12 -an `
  -vf "crop=1080:810:0:555,fade=in:0:9,fade=out:351:9" `
  -c:v libx264 -profile:v high -crf 25 -preset medium -pix_fmt yuv420p `
  -movflags +faststart `
  $bgMobile
Ok ("bg-login-mobile.mp4: {0:N2} MB" -f ((Get-Item $bgMobile).Length / 1MB))

# -------- Step 5: Poster frame --------
Section "Step 5: Extract poster frame at t=2s"
$poster = Join-Path $PUBLIC_DIR "intro-poster.jpg"
ffmpeg -y -hide_banner -loglevel error -i $intro4k -ss 2 -vframes 1 -vf "scale=1080:1920:flags=lanczos" -q:v 4 $poster
Ok ("intro-poster.jpg: {0:N2} MB" -f ((Get-Item $poster).Length / 1MB))

# -------- Step 6: Cleanup work area --------
Section "Step 6: Cleanup work area"
Remove-Item -Path $WORK_DIR -Recurse -Force
Ok "Cleaned"

# -------- Final summary --------
Section "Final asset summary"
Get-ChildItem $PUBLIC_DIR -Filter "intro-*"   | Sort-Object Name | ForEach-Object { "{0,-30} {1,8:N2} MB" -f $_.Name, ($_.Length / 1MB) }
Get-ChildItem $PUBLIC_DIR -Filter "bg-login-*" | Sort-Object Name | ForEach-Object { "{0,-30} {1,8:N2} MB" -f $_.Name, ($_.Length / 1MB) }
$total = Get-ChildItem -Path "$PUBLIC_DIR\*" -Include "intro-*","bg-login-*" -File | Measure-Object Length -Sum
Ok ("Total: {0:N2} MB across {1} files" -f ($total.Sum / 1MB), $total.Count)
Write-Host "`nDone. Outputs in $PUBLIC_DIR" -ForegroundColor Green
