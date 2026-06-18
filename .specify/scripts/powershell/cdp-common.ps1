function Invoke-CdpCommand {
    param(
        [System.Net.WebSockets.ClientWebSocket]$Client,
        [System.Threading.CancellationToken]$CancellationToken,
        [ref]$CommandId,
        [string]$Method,
        [hashtable]$Params
    )

    $CommandId.Value = [int]$CommandId.Value + 1
    $currentId = [int]$CommandId.Value
    $payload = [ordered]@{
        id = $currentId
        method = $Method
        params = if ($Params) { $Params } else { @{} }
    } | ConvertTo-Json -Depth 12 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
    $segment = [System.ArraySegment[byte]]::new($bytes)
    $Client.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $CancellationToken).GetAwaiter().GetResult()

    $buffer = New-Object byte[] 65536
    $stream = [System.IO.MemoryStream]::new()
    while ($true) {
        $receiveSegment = [System.ArraySegment[byte]]::new($buffer)
        $received = $Client.ReceiveAsync($receiveSegment, $CancellationToken).GetAwaiter().GetResult()
        if ($received.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
            throw "CDP WebSocket closed before $Method responded."
        }
        $stream.Write($buffer, 0, $received.Count)
        if (-not $received.EndOfMessage) { continue }

        $messageText = [System.Text.Encoding]::UTF8.GetString($stream.ToArray())
        $stream.SetLength(0)
        $message = $messageText | ConvertFrom-Json
        if ([int]$message.id -ne $currentId) { continue }
        if ($message.PSObject.Properties.Name -contains "error") {
            throw ("CDP command failed: " + ($message.error | ConvertTo-Json -Compress))
        }
        return $message.result
    }
}

function Invoke-CdpScreenshotData {
    param(
        [string]$DebuggerUrl,
        [int]$TimeoutSec = 10,
        [switch]$CaptureBeyondViewport
    )

    $client = [System.Net.WebSockets.ClientWebSocket]::new()
    $cts = [System.Threading.CancellationTokenSource]::new()
    $cts.CancelAfter([TimeSpan]::FromSeconds([Math]::Max(1, $TimeoutSec)))
    $commandId = 0

    try {
        $client.ConnectAsync([Uri]$DebuggerUrl, $cts.Token).GetAwaiter().GetResult()
        try {
            Invoke-CdpCommand -Client $client -CancellationToken $cts.Token -CommandId ([ref]$commandId) -Method "Page.bringToFront" -Params @{} | Out-Null
        } catch {}
        $params = @{
            format = "png"
            fromSurface = $true
        }
        if ($CaptureBeyondViewport) {
            $params.captureBeyondViewport = $true
        }
        $result = Invoke-CdpCommand -Client $client -CancellationToken $cts.Token -CommandId ([ref]$commandId) -Method "Page.captureScreenshot" -Params $params
        return [string]$result.data
    } finally {
        if ($client.State -eq [System.Net.WebSockets.WebSocketState]::Open) {
            try {
                $client.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [System.Threading.CancellationToken]::None).GetAwaiter().GetResult()
            } catch {}
        }
        $client.Dispose()
        $cts.Dispose()
    }
}
