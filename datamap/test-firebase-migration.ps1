# Test the Firebase-migrated API endpoints

Write-Host "Testing single risk score endpoint..." -ForegroundColor Green

$payload = @{
    serviceName = "LinkedIn"
    domain = "linkedin.com"
    policy = @{
        dataSelling = 8
        aiTraining = 7
        deleteDifficulty = 6
        summary = "LinkedIn sells user data"
    }
    breach = @{
        wasBreached = $true
        breachName = "LinkedIn-2012"
        breachYear = 2012
    }
    usage = @{
        lastUsedAt = (Get-Date).ToUniversalTime().ToString("o")
    }
    persist = $false
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/risk/score" `
        -Method POST `
        -ContentType "application/json" `
        -Body $payload `
        -UseBasicParsing
    Write-Host "Single score endpoint response:" -ForegroundColor Green
    Write-Host $response.Content
    Write-Host ""
} catch {
    Write-Host "Error testing single score endpoint: $_" -ForegroundColor Red
}

Write-Host "Testing batch risk score endpoint..." -ForegroundColor Green

$batchPayload = @{
    services = @(
        @{
            serviceName = "LinkedIn"
            domain = "linkedin.com"
            policy = @{
                dataSelling = 8
                aiTraining = 7
                deleteDifficulty = 6
                summary = "Test"
            }
            breach = @{
                wasBreached = $true
                breachName = "LinkedIn-2012"
                breachYear = 2012
            }
            usage = @{ lastUsedAt = (Get-Date).ToUniversalTime().ToString("o") }
        },
        @{
            serviceName = "TikTok"
            domain = "tiktok.com"
            policy = @{
                dataSelling = 9
                aiTraining = 8
                deleteDifficulty = 7
                summary = "Test"
            }
            breach = @{ wasBreached = $false }
            usage = @{ }
        }
    )
    persist = $false
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/risk/score/batch" `
        -Method POST `
        -ContentType "application/json" `
        -Body $batchPayload `
        -UseBasicParsing
    Write-Host "Batch score endpoint response:" -ForegroundColor Green
    Write-Host $response.Content
    Write-Host ""
} catch {
    Write-Host "Error testing batch endpoint: $_" -ForegroundColor Red
}

Write-Host "Testing policy analyze endpoint..." -ForegroundColor Green

$policyPayload = @{
    serviceName = "Google"
    domain = "google.com"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/api/policy/analyze" `
        -Method POST `
        -ContentType "application/json" `
        -Body $policyPayload `
        -UseBasicParsing
    Write-Host "Policy analyze endpoint response:" -ForegroundColor Green
    Write-Host $response.Content
    Write-Host ""
} catch {
    Write-Host "Error testing policy analyze endpoint: $_" -ForegroundColor Red
}

Write-Host "All tests completed!" -ForegroundColor Blue
