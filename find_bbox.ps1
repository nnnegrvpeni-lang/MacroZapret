Add-Type -AssemblyName System.Drawing

$srcPath = "C:\drivera\MacroZapret\assets\ikonka.png"
$src = [System.Drawing.Bitmap]::FromFile($srcPath)

$width = $src.Width
$height = $src.Height

$minX = $width
$maxX = 0
$minY = $height
$maxY = 0

# Scan pixels to find the bounding box of the active logo (thresholding dark pixels)
# We can sample every 4th pixel for speed
for ($y = 0; $y -lt $height; $y += 4) {
    for ($x = 0; $x -lt $width; $x += 4) {
        $pixel = $src.GetPixel($x, $y)
        
        # Check if pixel is not black/very dark (brightness > 0.05 or any color channel > 20)
        if ($pixel.R -gt 25 -or $pixel.G -gt 25 -or $pixel.B -gt 25) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

$src.Dispose()

Write-Host "Active bounding box: X=$minX..$maxX, Y=$minY..$maxY"
Write-Host "Logo width: $($maxX - $minX), height: $($maxY - $minY)"
Write-Host "Original dimensions: ${width}x${height}"
