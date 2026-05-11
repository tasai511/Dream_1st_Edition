param(
  [int]$Port = 5173
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg" = "image/svg+xml"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".ico" = "image/x-icon"
  ".csv" = "text/csv; charset=utf-8"
}

function New-HttpResponse {
  param(
    [int]$StatusCode,
    [string]$StatusText,
    [string]$ContentType,
    [byte[]]$Body
  )

  $headers = @(
    "HTTP/1.1 $StatusCode $StatusText",
    "Content-Type: $ContentType",
    "Content-Length: $($Body.Length)",
    "Cache-Control: no-store",
    "Connection: close",
    "",
    ""
  ) -join "`r`n"

  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
  $response = [byte[]]::new($headerBytes.Length + $Body.Length)
  [System.Buffer]::BlockCopy($headerBytes, 0, $response, 0, $headerBytes.Length)
  [System.Buffer]::BlockCopy($Body, 0, $response, $headerBytes.Length, $Body.Length)
  return $response
}

function New-TextResponse {
  param(
    [int]$StatusCode,
    [string]$StatusText,
    [string]$Text
  )

  $body = [System.Text.Encoding]::UTF8.GetBytes($Text)
  return New-HttpResponse $StatusCode $StatusText "text/plain; charset=utf-8" $body
}

try {
  $listener.Start()
  Write-Host "Serving $root at http://localhost:$Port/"
  Write-Host "Open http://localhost:$Port/app/"
  Write-Host "Press Ctrl+C to stop."

  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $buffer = [byte[]]::new(8192)
      $count = $stream.Read($buffer, 0, $buffer.Length)
      if ($count -le 0) {
        continue
      }

      $requestText = [System.Text.Encoding]::ASCII.GetString($buffer, 0, $count)
      $requestLine = ($requestText -split "`r?`n")[0]
      $parts = $requestLine -split " "
      if ($parts.Length -lt 2 -or $parts[0] -ne "GET") {
        $response = New-TextResponse 405 "Method Not Allowed" "Method not allowed"
        $stream.Write($response, 0, $response.Length)
        continue
      }

      $path = [Uri]::UnescapeDataString(($parts[1] -split "\?")[0].TrimStart("/"))
      if ([string]::IsNullOrWhiteSpace($path)) {
        $path = "index.html"
      }
      if ($path.EndsWith("/")) {
        $path = Join-Path $path "index.html"
      }

      $target = Join-Path $root $path
      $fullPath = [System.IO.Path]::GetFullPath($target)
      $rootPath = [System.IO.Path]::GetFullPath($root)

      if (-not $fullPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        $response = New-TextResponse 403 "Forbidden" "Forbidden"
        $stream.Write($response, 0, $response.Length)
        continue
      }

      if (-not [System.IO.File]::Exists($fullPath)) {
        $response = New-TextResponse 404 "Not Found" "Not found"
        $stream.Write($response, 0, $response.Length)
        continue
      }

      $extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
      $contentType = $mimeTypes[$extension]
      if (-not $contentType) {
        $contentType = "application/octet-stream"
      }

      $body = [System.IO.File]::ReadAllBytes($fullPath)
      $response = New-HttpResponse 200 "OK" $contentType $body
      $stream.Write($response, 0, $response.Length)
    }
    finally {
      $client.Close()
    }
  }
}
finally {
  $listener.Stop()
}
