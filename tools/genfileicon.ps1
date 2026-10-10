Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root '.tmp\icons-file'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-RoundedRect([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  if ($r -le 0) { $r = 0.001 }
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

$c1 = [System.Drawing.Color]::FromArgb(255, 76, 201, 255)
$c2 = [System.Drawing.Color]::FromArgb(255, 176, 107, 255)
$navy = [System.Drawing.Color]::FromArgb(255, 28, 36, 62)
$lineCol = [System.Drawing.Color]::FromArgb(255, 198, 207, 224)
$edgeCol = [System.Drawing.Color]::FromArgb(255, 210, 218, 234)
$foldCol = [System.Drawing.Color]::FromArgb(255, 206, 214, 231)

$sizes = @(256, 128, 64, 48, 32, 16)
foreach ($s in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap($s, $s)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  # page (portrait) with folded top-right corner
  $pw = 0.66 * $s; $ph = 0.86 * $s
  $px = (0.50 * $s) - $pw / 2; $py = 0.07 * $s
  $pr = 0.075 * $s; $fold = 0.24 * $pw
  $page = New-Object System.Drawing.Drawing2D.GraphicsPath
  $page.AddLine($px + $pr, $py, $px + $pw - $fold, $py)
  $page.AddLine($px + $pw - $fold, $py, $px + $pw, $py + $fold)
  $page.AddLine($px + $pw, $py + $fold, $px + $pw, $py + $ph - $pr)
  $page.AddArc($px + $pw - 2 * $pr, $py + $ph - 2 * $pr, 2 * $pr, 2 * $pr, 0, 90)
  $page.AddLine($px + $pw - $pr, $py + $ph, $px + $pr, $py + $ph)
  $page.AddArc($px, $py + $ph - 2 * $pr, 2 * $pr, 2 * $pr, 90, 90)
  $page.AddLine($px, $py + $ph - $pr, $px, $py + $pr)
  $page.AddArc($px, $py, 2 * $pr, 2 * $pr, 180, 90)
  $page.CloseFigure()
  $g.FillPath([System.Drawing.Brushes]::White, $page)
  $g.DrawPath((New-Object System.Drawing.Pen($edgeCol, [single]([Math]::Max(1.0, 0.014 * $s)))), $page)

  # folded corner shade
  $fp = New-Object System.Drawing.Drawing2D.GraphicsPath
  $fp.AddLine($px + $pw - $fold, $py, $px + $pw, $py + $fold)
  $fp.AddLine($px + $pw, $py + $fold, $px + $pw - $fold, $py + $fold)
  $fp.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush($foldCol)), $fp)

  # artwork panel (gradient + mountain + sun)
  $ax = $px + 0.11 * $pw; $ay = $py + 0.09 * $ph; $aw = 0.78 * $pw; $ah = 0.46 * $ph
  $ap = New-RoundedRect $ax $ay $aw $ah (0.12 * $aw)
  $gb = New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.RectangleF($ax, $ay, $aw, $ah)), $c1, $c2, 45)
  $g.FillPath($gb, $ap)
  $g.SetClip($ap)
  $sunS = 0.24 * $ah
  $g.FillEllipse([System.Drawing.Brushes]::White, ($ax + 0.62 * $aw), ($ay + 0.14 * $ah), $sunS, $sunS)
  $mm = @(
    (New-Object System.Drawing.PointF(($ax + 0.02 * $aw), ($ay + $ah))),
    (New-Object System.Drawing.PointF(($ax + 0.42 * $aw), ($ay + 0.28 * $ah))),
    (New-Object System.Drawing.PointF(($ax + 0.82 * $aw), ($ay + $ah)))
  )
  $g.FillPolygon([System.Drawing.Brushes]::White, $mm)
  $g.ResetClip()

  # text lines
  $lb = New-Object System.Drawing.SolidBrush($lineCol)
  $g.FillRectangle($lb, ($px + 0.13 * $pw), ($ay + $ah + 0.10 * $ph), (0.74 * $pw), (0.075 * $ph))
  $g.FillRectangle($lb, ($px + 0.13 * $pw), ($ay + $ah + 0.24 * $ph), (0.46 * $pw), (0.075 * $ph))

  # game controller badge (bottom-right)
  $br = 0.20 * $s
  $bx = $px + $pw - 0.12 * $s; $by = $py + $ph - 0.10 * $s
  $g.FillEllipse([System.Drawing.Brushes]::White, ($bx - $br - 0.02 * $s), ($by - $br - 0.02 * $s), (($br + 0.02 * $s) * 2), (($br + 0.02 * $s) * 2))
  $g.FillEllipse((New-Object System.Drawing.SolidBrush($navy)), ($bx - $br), ($by - $br), ($br * 2), ($br * 2))
  # controller glyph (white)
  $gw = 1.05 * $br; $gh = 0.62 * $br
  $gx = $bx - $gw / 2; $gy = $by - $gh / 2
  $wht = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 236, 242, 252))
  $g.FillEllipse($wht, ($gx + 0.02 * $gw), ($gy - 0.10 * $gh), (0.42 * $gh), (0.42 * $gh))
  $g.FillEllipse($wht, ($gx + $gw - 0.44 * $gh), ($gy - 0.10 * $gh), (0.42 * $gh), (0.42 * $gh))
  $body = New-RoundedRect ($gx + 0.06 * $gw) $gy (0.88 * $gw) $gh (0.28 * $gh)
  $g.FillPath($wht, $body)
  $dk = New-Object System.Drawing.SolidBrush($navy)
  $g.FillRectangle($dk, ($gx + 0.20 * $gw), ($gy + 0.30 * $gh), (0.16 * $gw), (0.26 * $gh))
  $g.FillRectangle($dk, ($gx + 0.15 * $gw), ($gy + 0.40 * $gh), (0.26 * $gw), (0.26 * $gh))
  $g.FillEllipse($dk, ($gx + 0.62 * $gw), ($gy + 0.30 * $gh), (0.16 * $gh), (0.16 * $gh))
  $g.FillEllipse($dk, ($gx + 0.73 * $gw), ($gy + 0.46 * $gh), (0.16 * $gh), (0.16 * $gh))

  $g.Dispose()
  $bmp.Save((Join-Path $outDir ("icon_$s.png")), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
Write-Output ('OK ' + $outDir)
