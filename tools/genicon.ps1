Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root '.tmp\icons'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-RoundedPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

$sizes = @(256, 128, 64, 48, 32, 16)
foreach ($s in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap($s, $s)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  # 背景：青->紫 渐变圆角方块
  $rect = New-Object System.Drawing.Rectangle(0, 0, $s, $s)
  $c1 = [System.Drawing.Color]::FromArgb(255, 76, 201, 255)
  $c2 = [System.Drawing.Color]::FromArgb(255, 176, 107, 255)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 45)
  $bg = New-RoundedPath 0 0 $s $s ([single]($s * 0.20))
  $g.FillPath($brush, $bg)

  # 白色画框（圆角描边）
  $fx = 0.22 * $s; $fy = 0.26 * $s; $fw = 0.56 * $s; $fh = 0.48 * $s; $fr = 0.09 * $s
  $frame = New-RoundedPath $fx $fy $fw $fh $fr

  # 框内：太阳 + 山（裁剪在框内）
  $g.SetClip($frame)
  $sun = 0.115 * $s
  $g.FillEllipse([System.Drawing.Brushes]::White, (0.60 * $s), (0.35 * $s), $sun, $sun)
  $m1 = @(
    (New-Object System.Drawing.PointF((0.24 * $s), (0.74 * $s))),
    (New-Object System.Drawing.PointF((0.44 * $s), (0.46 * $s))),
    (New-Object System.Drawing.PointF((0.64 * $s), (0.74 * $s)))
  )
  $g.FillPolygon([System.Drawing.Brushes]::White, $m1)
  $m2 = @(
    (New-Object System.Drawing.PointF((0.52 * $s), (0.74 * $s))),
    (New-Object System.Drawing.PointF((0.66 * $s), (0.56 * $s))),
    (New-Object System.Drawing.PointF((0.80 * $s), (0.74 * $s)))
  )
  $g.FillPolygon([System.Drawing.Brushes]::White, $m2)
  $g.ResetClip()

  # 画框描边（置于最上层，边缘干净）
  $penW = [single]([Math]::Max(1.2, 0.065 * $s))
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $penW)
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawPath($pen, $frame)

  $g.Dispose()
  $bmp.Save((Join-Path $outDir ("icon_$s.png")), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
Write-Output ('OK ' + $outDir)
