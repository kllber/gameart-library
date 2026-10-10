param([string]$Src, [string]$OutDir, [double]$Pad = 0.06)
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$img = [System.Drawing.Bitmap]::FromFile($Src)
$w = $img.Width; $h = $img.Height
$rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$data = $img.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
$img.UnlockBits($data)

# alpha bbox (sample every 2px)
$minx = $w; $miny = $h; $maxx = -1; $maxy = -1
for ($y = 0; $y -lt $h; $y += 2) {
  $rowOff = $y * $stride
  for ($x = 0; $x -lt $w; $x += 2) {
    if ($bytes[$rowOff + $x * 4 + 3] -gt 16) {
      if ($x -lt $minx) { $minx = $x }
      if ($x -gt $maxx) { $maxx = $x }
      if ($y -lt $miny) { $miny = $y }
      if ($y -gt $maxy) { $maxy = $y }
    }
  }
}
if ($maxx -lt 0) { $minx = 0; $miny = 0; $maxx = $w - 1; $maxy = $h - 1 }
# inset 2px to drop fringing
$minx = [Math]::Min($minx + 2, $w - 1); $miny = [Math]::Min($miny + 2, $h - 1)
$maxx = [Math]::Max($maxx - 2, 0); $maxy = [Math]::Max($maxy - 2, 0)
$bw = $maxx - $minx + 1; $bh = $maxy - $miny + 1
$crop = New-Object System.Drawing.Rectangle($minx, $miny, $bw, $bh)

foreach ($s in @(256, 128, 64, 48, 32, 16)) {
  $bmp = New-Object System.Drawing.Bitmap($s, $s)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $box = $s * (1 - 2 * $Pad)
  $scale = [Math]::Min($box / $bw, $box / $bh)
  $dw = $bw * $scale; $dh = $bh * $scale
  $dx = ($s - $dw) / 2.0; $dy = ($s - $dh) / 2.0
  $dst = New-Object System.Drawing.RectangleF([single]$dx, [single]$dy, [single]$dw, [single]$dh)
  $g.DrawImage($img, $dst, $crop, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $bmp.Save((Join-Path $OutDir ("icon_$s.png")), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
$img.Dispose()
Write-Output ("OK " + $OutDir + "  crop=" + $minx + "," + $miny + "," + $bw + "x" + $bh)
