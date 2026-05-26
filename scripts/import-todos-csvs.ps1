param(
    [int]$Batch = 500,
    [int]$Limit = 0
)

$CsvDir = "data\portal-csv-imports"
$Anos = @(2021, 2022, 2023, 2024, 2025, 2026)

foreach ($Ano in $Anos) {
    $Arquivo = Get-ChildItem "$CsvDir\${Ano}_*.zip" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $Arquivo) {
        Write-Host "SEM ZIP para $Ano em $CsvDir -- pulando." -ForegroundColor Yellow
        continue
    }

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Importando $Ano -- $($Arquivo.Name)" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan

    $cmdArgs = @(
        "tsx", "--require", "dotenv/config",
        "scripts/import-portal-csv.ts",
        "--file", $Arquivo.FullName,
        "--batch", $Batch
    )
    if ($Limit -gt 0) { $cmdArgs += @("--limit", $Limit) }

    & npx @cmdArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERRO no ano $Ano (exit $LASTEXITCODE). Abortando." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Write-Host ""
Write-Host "Todos os anos importados com sucesso!" -ForegroundColor Green
