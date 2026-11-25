# Server lokal MOXUP memakai PowerShell bawaan Windows: tidak perlu memasang apa pun.
# Dijalankan oleh MOXUP LAUNCHER.bat. Hanya melayani komputer ini sendiri (localhost).
$root = $PSScriptRoot
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'
  '.glb' = 'model/gltf-binary'; '.woff2' = 'font/woff2'
}

# port 3210, atau yang berikutnya bila sedang dipakai (misalnya aplikasi ini sudah terbuka)
$listener = $null
foreach ($port in 3210..3219) {
  try {
    $try = New-Object System.Net.HttpListener
    $try.Prefixes.Add("http://localhost:$port/")
    $try.Start()
    $listener = $try
    break
  } catch { }
}
if (-not $listener) {
  Write-Host 'MOXUP tidak bisa dimulai: port 3210-3219 sedang dipakai semua.'
  exit 1
}

Write-Host "MOXUP berjalan di http://localhost:$port"
Write-Host 'Biarkan jendela ini terbuka selama memakai aplikasi. Tutup jendela ini untuk berhenti.'
if (-not $env:MOCKUP_NO_OPEN) { Start-Process "http://localhost:$port/" }

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
    # never serve anything outside this folder
    if ($file.StartsWith($root + [IO.Path]::DirectorySeparatorChar) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $type = $mime[[IO.Path]::GetExtension($file).ToLower()]
      if (-not $type) { $type = 'application/octet-stream' }
      $ctx.Response.ContentType = $type
      $ctx.Response.Headers.Add('Cache-Control', 'no-store')
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
  } catch {
    # a browser that closed the connection early must not stop the server
  } finally {
    $ctx.Response.Close()
  }
}
