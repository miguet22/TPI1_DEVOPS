param([string]$BaseUrl = 'http://127.0.0.1:8080')

$ErrorActionPreference = 'Stop'
Push-Location (Join-Path $PSScriptRoot '..')

function Test-Nodes([int]$Expected) {
    $webNodes = @{}
    $apiNodes = @{}
    for ($i = 0; $i -lt 18; $i++) {
        $web = Invoke-WebRequest -UseBasicParsing "$BaseUrl/" -TimeoutSec 15
        $api = Invoke-WebRequest -UseBasicParsing "$BaseUrl/api/health" -TimeoutSec 15
        $health = $api.Content | ConvertFrom-Json
        if (-not $health.redis_connected -or $health.redis_mode -ne 'Servidor Redis (redis:6379)') {
            throw 'La API no esta conectada al Redis real.'
        }
        $webNode = [string]$web.Headers['X-Web-Node']
        $apiNode = [string]$api.Headers['X-API-Node']
        if (-not $webNode -or -not $apiNode) { throw 'Faltan identificadores de nodos.' }
        $webNodes[$webNode] = $true
        $apiNodes[$apiNode] = $true
    }
    Write-Host "Web ($($webNodes.Count)): $($webNodes.Keys -join ', ')"
    Write-Host "API ($($apiNodes.Count)): $($apiNodes.Keys -join ', ')"
    if ($webNodes.Count -ne $Expected -or $apiNodes.Count -ne $Expected) {
        throw "Se esperaban $Expected nodos de cada servicio."
    }
}

function Test-SharedData {
    $created = Invoke-RestMethod "$BaseUrl/api/items" -Method Post -ContentType 'application/json' -Body '{"name":"Demo temporal de balanceo"}' -TimeoutSec 15
    try {
        Invoke-RestMethod "$BaseUrl/api/items/$($created.id)" -Method Put -ContentType 'application/json' -Body '{"completed":true}' -TimeoutSec 15 | Out-Null
        for ($i = 0; $i -lt 6; $i++) {
            $items = Invoke-RestMethod "$BaseUrl/api/items" -TimeoutSec 15
            if (-not ($items | Where-Object { $_.id -eq $created.id -and $_.completed })) {
                throw 'Las replicas no comparten el producto actualizado.'
            }
        }
    } finally {
        Invoke-RestMethod "$BaseUrl/api/items/$($created.id)" -Method Delete -TimeoutSec 15 | Out-Null
    }
    $items = Invoke-RestMethod "$BaseUrl/api/items" -TimeoutSec 15
    if ($items | Where-Object { $_.id -eq $created.id }) { throw 'El producto temporal no se elimino.' }
    Write-Host 'Crear, completar, consultar y eliminar: OK.'
}

try {
    Write-Host '1. Comprobar las tres replicas y los datos compartidos.'
    Test-Nodes 3
    Test-SharedData
    try {
        Write-Host '2. Detener frontend y backend; deben responder las otras dos replicas.'
        docker compose stop frontend backend
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron detener las replicas.' }
        Test-Nodes 2
        Test-SharedData
    } finally {
        Write-Host '3. Restaurar las replicas detenidas.'
        docker compose start --wait frontend backend
        if ($LASTEXITCODE -ne 0) { throw 'No se pudieron restaurar las replicas.' }
    }
    # Allow the proxy DNS cache and passive failure timeout to expire.
    Start-Sleep -Seconds 6
    Test-Nodes 3
    Write-Host 'OK: balanceo, tolerancia a caidas y recuperacion comprobados.'
} finally {
    Pop-Location
}
