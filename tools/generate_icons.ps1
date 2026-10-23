Add-Type -AssemblyName System.Drawing

function Create-CopyUnlockerIcon([int]$size, [string]$path) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $g.Clear([System.Drawing.Color]::Transparent)

    # Base rounded rectangle / badge
    $pad = [Math]::Max(1, [int]($size * 0.04))
    $rectSize = $size - (2 * $pad)
    $cornerRad = [Math]::Max(2, [int]($size * 0.22))

    $pathObj = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $cornerRad * 2
    $r = New-Object System.Drawing.Rectangle $pad, $pad, $rectSize, $rectSize

    $pathObj.AddArc($r.X, $r.Y, $d, $d, 180, 90)
    $pathObj.AddArc($r.Right - $d, $r.Y, $d, $d, 270, 90)
    $pathObj.AddArc($r.Right - $d, $r.Bottom - $d, $d, $d, 0, 90)
    $pathObj.AddArc($r.X, $r.Bottom - $d, $d, $d, 90, 90)
    $pathObj.CloseFigure()

    # Blue gradient fill
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point 0, 0),
        (New-Object System.Drawing.Point $size, $size),
        [System.Drawing.Color]::FromArgb(37, 99, 235),
        [System.Drawing.Color]::FromArgb(29, 78, 216)
    )
    $g.FillPath($brush, $pathObj)

    # White icon graphics: 2 overlapping documents
    $penWidth = [Math]::Max(1.0, [float]($size * 0.07))
    $docPen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $penWidth)

    # Back doc outline
    $bLeft = [float]($size * 0.22)
    $bTop = [float]($size * 0.20)
    $bWidth = [float]($size * 0.38)
    $bHeight = [float]($size * 0.46)
    $g.DrawRectangle($docPen, $bLeft, $bTop, $bWidth, $bHeight)

    # Front doc filled white
    $fLeft = [float]($size * 0.38)
    $fTop = [float]($size * 0.34)
    $fWidth = [float]($size * 0.40)
    $fHeight = [float]($size * 0.46)

    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillRectangle($whiteBrush, $fLeft, $fTop, $fWidth, $fHeight)

    # Text lines on front doc (blue lines)
    if ($size -ge 24) {
        $lineWidth = [Math]::Max(1.0, [float]($size * 0.05))
        $linePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(37, 99, 235), $lineWidth)

        $l1Y = [float]($fTop + ($fHeight * 0.28))
        $l2Y = [float]($fTop + ($fHeight * 0.52))
        $l3Y = [float]($fTop + ($fHeight * 0.74))
        $lStart = [float]($fLeft + ($fWidth * 0.18))
        $lEnd = [float]($fLeft + ($fWidth * 0.82))
        $lShortEnd = [float]($fLeft + ($fWidth * 0.58))

        $g.DrawLine($linePen, $lStart, $l1Y, $lEnd, $l1Y)
        $g.DrawLine($linePen, $lStart, $l2Y, $lEnd, $l2Y)
        $g.DrawLine($linePen, $lStart, $l3Y, $lShortEnd, $l3Y)
        $linePen.Dispose()
    }

    $docPen.Dispose()
    $whiteBrush.Dispose()
    $brush.Dispose()
    $pathObj.Dispose()

    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Output "Successfully generated $path ($size x $size)"
}

Create-CopyUnlockerIcon 16 "icons/icon16.png"
Create-CopyUnlockerIcon 32 "icons/icon32.png"
Create-CopyUnlockerIcon 48 "icons/icon48.png"
Create-CopyUnlockerIcon 128 "icons/icon128.png"
