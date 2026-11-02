$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot
Write-Host 'Preparando Lotes SEHURB 1.0.0' -ForegroundColor Green
if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Instale Node.js 22 ou superior e abra este preparador novamente.' }
$nodeMajor = [int]((& node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) { throw 'Use Node.js 22 ou superior.' }
$pythonPath = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    if (Get-Command py -ErrorAction SilentlyContinue) { & py -3.12 -m venv .venv }
    else { & python -m venv .venv }
    if ($LASTEXITCODE -ne 0) { throw 'Instale Python 3.12 (64 bits), com acesso pelo terminal.' }
}
& $pythonPath -c "import sys; assert sys.version_info[:2] == (3,12), 'Use Python 3.12 nesta versao'"
if ($LASTEXITCODE -ne 0) { throw 'O ambiente Python precisa usar a versão 3.12.' }
& $pythonPath -m pip install -r services/engine/requirements.lock.txt
if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar o motor Python.' }
& npm.cmd ci --prefix apps/web
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar os componentes da interface.' }
& npm.cmd run build --prefix apps/web
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar a interface.' }
& $pythonPath scripts/doctor.py
if ($LASTEXITCODE -ne 0) { throw 'A verificação encontrou uma dependência ausente.' }
Write-Host 'Pronto. Abra Iniciar Lotes SEHURB.cmd para usar.' -ForegroundColor Green
