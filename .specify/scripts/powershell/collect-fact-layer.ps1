param(
    [string]$SdkLogDir = "",
    [string]$BridgeLogDir = "",
    [string]$BrowserUrl = "http://127.0.0.1:9222",
    [string]$TargetUrlPattern = "app-home|app-main-window|frontend/static/index.html",
    [switch]$Json
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($SdkLogDir)) {
    $SdkLogDir = Join-Path ([System.IO.Path]::GetTempPath()) "SDKLog"
}
if ([string]::IsNullOrWhiteSpace($BridgeLogDir)) {
    $BridgeLogDir = Join-Path ([System.IO.Path]::GetTempPath()) "ServiceBridgeLog"
}

function Get-LatestLog {
    param(
        [string]$Directory,
        [string]$Pattern
    )

    if (-not (Test-Path -LiteralPath $Directory)) {
        return [ordered]@{
            found = $false
            directory = $Directory
            pattern = $Pattern
            path = $null
            lastWriteTime = $null
            length = $null
            reason = "directory-not-found"
        }
    }

    $file = Get-ChildItem -LiteralPath $Directory -Filter $Pattern -File |
        Sort-Object @{ Expression = {
            if ($_.BaseName -match '(\d{14})$') { $matches[1] } else { "" }
        }; Descending = $true }, @{ Expression = "LastWriteTime"; Descending = $true } |
        Select-Object -First 1

    if (-not $file) {
        return [ordered]@{
            found = $false
            directory = $Directory
            pattern = $Pattern
            path = $null
            lastWriteTime = $null
            length = $null
            reason = "log-not-found"
        }
    }

    return [ordered]@{
        found = $true
        directory = $Directory
        pattern = $Pattern
        path = $file.FullName
        lastWriteTime = $file.LastWriteTime.ToString("o")
        length = $file.Length
        reason = $null
    }
}

function Get-DevToolsInfo {
    param([string]$Url)

    $normalizedUrl = $Url.TrimEnd("/")
    $versionUrl = "$normalizedUrl/json/version"
    $targetsUrl = "$normalizedUrl/json/list"

    try {
        $version = Invoke-RestMethod -Uri $versionUrl -TimeoutSec 2
        $targets = Invoke-RestMethod -Uri $targetsUrl -TimeoutSec 2
        $targetSummary = @(
            foreach ($target in $targets) {
                [ordered]@{
                    id = $target.id
                    type = $target.type
                    title = $target.title
                    url = $target.url
                    webSocketDebuggerUrl = $target.webSocketDebuggerUrl
                }
            }
        )

        $selectedTarget = Select-DevToolsTarget -Targets $targetSummary -Pattern $TargetUrlPattern
        $directCdp = Get-DirectCdpSnapshot -Target $selectedTarget

        return [ordered]@{
            available = $true
            browserUrl = $normalizedUrl
            versionUrl = $versionUrl
            targetsUrl = $targetsUrl
            browser = $version.Browser
            protocolVersion = $version."Protocol-Version"
            targets = $targetSummary
            targetUrlPattern = $TargetUrlPattern
            selectedTarget = $selectedTarget
            directCdp = $directCdp
            error = $null
        }
    } catch {
        return [ordered]@{
            available = $false
            browserUrl = $normalizedUrl
            versionUrl = $versionUrl
            targetsUrl = $targetsUrl
            browser = $null
            protocolVersion = $null
            targets = @()
            targetUrlPattern = $TargetUrlPattern
            selectedTarget = $null
            directCdp = [ordered]@{
                available = $false
                error = "devtools-unavailable"
            }
            error = $_.Exception.Message
        }
    }
}

function Select-DevToolsTarget {
    param(
        [array]$Targets,
        [string]$Pattern
    )

    $pageTargets = @($Targets | Where-Object { $_.type -eq "page" -and $_.url -notlike "devtools://*" })
    if ($pageTargets.Count -eq 0) {
        return $null
    }

    if (-not [string]::IsNullOrWhiteSpace($Pattern)) {
        $matched = @($pageTargets | Where-Object {
            ($_.url -match $Pattern) -or ($_.title -match $Pattern)
        })
        if ($matched.Count -gt 0) {
            return $matched[0]
        }
    }

    $httpTarget = @($pageTargets | Where-Object { $_.url -match "^https?://" })
    if ($httpTarget.Count -gt 0) {
        return $httpTarget[0]
    }

    return $pageTargets[0]
}

function Invoke-CdpCommand {
    param(
        [System.Net.WebSockets.ClientWebSocket]$WebSocket,
        [int]$Id,
        [string]$Method,
        [object]$Params
    )

    $payload = @{
        id = $Id
        method = $Method
        params = $Params
    } | ConvertTo-Json -Depth 20 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $segment = [ArraySegment[byte]]::new($bytes)
    $null = $WebSocket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
}

function Receive-CdpResponse {
    param(
        [System.Net.WebSockets.ClientWebSocket]$WebSocket,
        [int]$Id,
        [int]$TimeoutMs = 5000
    )

    $deadline = [DateTimeOffset]::UtcNow.AddMilliseconds($TimeoutMs)
    $buffer = New-Object byte[] 65536
    while ([DateTimeOffset]::UtcNow -lt $deadline) {
        $remaining = [int][Math]::Max(1, ($deadline - [DateTimeOffset]::UtcNow).TotalMilliseconds)
        $cts = [Threading.CancellationTokenSource]::new($remaining)
        try {
            $stream = [IO.MemoryStream]::new()
            do {
                $segment = [ArraySegment[byte]]::new($buffer)
                $receive = $WebSocket.ReceiveAsync($segment, $cts.Token).GetAwaiter().GetResult()
                if ($receive.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
                    throw "CDP websocket closed before response $Id"
                }
                $stream.Write($buffer, 0, $receive.Count)
            } while (-not $receive.EndOfMessage)

            $text = [System.Text.Encoding]::UTF8.GetString($stream.ToArray())
            $message = $text | ConvertFrom-Json
            if ($message.id -eq $Id) {
                return $message
            }
        } catch [System.OperationCanceledException] {
            break
        } finally {
            $cts.Dispose()
        }
    }

    throw "Timed out waiting for CDP response $Id"
}

function Get-DirectCdpSnapshot {
    param([object]$Target)

    if (-not $Target -or [string]::IsNullOrWhiteSpace($Target.webSocketDebuggerUrl)) {
        return [ordered]@{
            available = $false
            error = "target-not-found"
        }
    }

    $script = @'
(() => {
  const pick = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      selector,
      tagName: el.tagName,
      className: typeof el.className === "string" ? el.className : "",
      text: (el.innerText || el.textContent || "").slice(0, 200),
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      style: {
        display: style.display,
        position: style.position,
        overflow: style.overflow,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        boxSizing: style.boxSizing,
        width: style.width,
        height: style.height,
        minWidth: style.minWidth,
        minHeight: style.minHeight,
        maxWidth: style.maxWidth,
        maxHeight: style.maxHeight,
        padding: style.padding,
        margin: style.margin,
        flex: style.flex,
        flexDirection: style.flexDirection,
      },
    };
  };
  const selectors = [
    "body",
    "[data-test='app-main-window']",
    "[data-test='app-main-window-body']",
    "[data-test='app-device-list']",
    "[data-test='app-device-list-panel']",
    "[data-test='app-device-tree']",
    ".left-panel",
    ".device-list-page",
    ".device-list-shell",
    ".device-panel",
    ".panel-header",
    ".panel-content",
    ".panel-body",
    ".info-panel",
    ".center-panel",
    ".bottom-toolbar"
  ];
  return {
    title: document.title,
    href: location.href,
    readyState: document.readyState,
    nodeCount: document.querySelectorAll("*").length,
    bodyText: document.body ? document.body.innerText.slice(0, 500) : "",
    elements: selectors.map(pick).filter(Boolean),
  };
})()
'@

    $ws = [System.Net.WebSockets.ClientWebSocket]::new()
    try {
        $null = $ws.ConnectAsync([Uri]$Target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
        Invoke-CdpCommand -WebSocket $ws -Id 1 -Method "Runtime.evaluate" -Params @{
            expression = $script
            returnByValue = $true
            awaitPromise = $false
        }
        $response = Receive-CdpResponse -WebSocket $ws -Id 1
        if ($response.error) {
            throw ($response.error | ConvertTo-Json -Depth 8 -Compress)
        }
        $value = $response.result.result.value
        return [ordered]@{
            available = $true
            method = "direct-cdp-runtime-evaluate"
            error = $null
            snapshot = $value
        }
    } catch {
        return [ordered]@{
            available = $false
            method = "direct-cdp-runtime-evaluate"
            error = $_.Exception.Message
        }
    } finally {
        if ($ws.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
            $null = $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [Threading.CancellationToken]::None).GetAwaiter().GetResult()
        }
        $ws.Dispose()
    }
}

$result = [ordered]@{
    generatedAt = (Get-Date).ToString("o")
    defaults = [ordered]@{
        sdkLogDir = $SdkLogDir
        bridgeLogDir = $BridgeLogDir
        browserUrl = "http://127.0.0.1:9222"
        targetUrlPattern = "app-home|app-main-window|frontend/static/index.html"
    }
    sdkLog = Get-LatestLog -Directory $SdkLogDir -Pattern "SDK_*.log"
    bridgeLog = Get-LatestLog -Directory $BridgeLogDir -Pattern "ServiceBridge_*.log"
    devtools = Get-DevToolsInfo -Url $BrowserUrl
}

if ($Json) {
    $result | ConvertTo-Json -Depth 8 -Compress
} else {
    $result | ConvertTo-Json -Depth 8
}
