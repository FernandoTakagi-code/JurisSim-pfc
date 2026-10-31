[CmdletBinding()]
param([string]$PostgresBin = 'C:\Program Files\PostgreSQL\17\bin')

$ErrorActionPreference = 'Stop'
$Port = 55432
$Database = 'jurissim_demo'
$SessionPath = Join-Path $env:TEMP 'jurissim-academic-demo-session.json'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$Backend = Join-Path $RepoRoot 'backend'
$Root = Join-Path $env:TEMP ('jurissim-academic-demo-' + [guid]::NewGuid().ToString('N'))
$Data = Join-Path $Root 'pgdata'
$Log = Join-Path $Root 'postgres.log'
$Shim = Join-Path $Root 'tsx-os-compat.cjs'
$Started = $false
$OriginalLocation = Get-Location

function Invoke-Checked([string]$Executable, [string[]]$Arguments) {
  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Disposable demo command failed: $([IO.Path]::GetFileName($Executable))." }
}

function Remove-OwnTemporaryRoot {
  if (-not (Test-Path -LiteralPath $Root)) { return }
  $fullRoot = [IO.Path]::GetFullPath($Root)
  $fullTemp = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')
  if ((Split-Path -Parent $fullRoot) -ne $fullTemp -or (Split-Path -Leaf $fullRoot) -notmatch '^jurissim-academic-demo-[0-9a-f]{32}$') {
    throw 'Refusing to remove an unverified temporary directory.'
  }
  Remove-Item -LiteralPath $fullRoot -Recurse -Force
}

if (Test-Path -LiteralPath $SessionPath) { throw "A demo session record already exists at $SessionPath. Stop that session first." }
foreach ($exe in @('initdb.exe', 'pg_ctl.exe', 'psql.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $PostgresBin $exe))) { throw "PostgreSQL executable missing: $exe" }
}
if (Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue) {
  throw "Port $Port is already in use; refusing to connect to it."
}

try {
  New-Item -ItemType Directory -Path $Root | Out-Null
  Invoke-Checked (Join-Path $PostgresBin 'initdb.exe') @('-D', $Data, '--username=postgres', '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--no-locale')
  Invoke-Checked (Join-Path $PostgresBin 'pg_ctl.exe') @('-D', $Data, '-l', $Log, '-o', "-p $Port -h 127.0.0.1 -c listen_addresses=127.0.0.1 -c ssl=off", '-w', 'start')
  $Started = $true

  $postgresUrl = "postgresql://postgres@127.0.0.1:$Port/postgres"
  $identity = & (Join-Path $PostgresBin 'psql.exe') $postgresUrl -Atc "SELECT (pg_control_system()).system_identifier::text || '|' || inet_server_addr()::text || '|' || inet_server_port()::text || '|' || current_setting('server_version')"
  if ($LASTEXITCODE -ne 0) { throw 'Could not verify the disposable PostgreSQL identity.' }
  $parts = $identity -split '\|'
  if ($parts.Count -ne 4 -or $parts[1] -notin @('127.0.0.1', '127.0.0.1/32') -or $parts[2] -ne "$Port") {
    throw 'PostgreSQL identity is not the expected loopback demo cluster.'
  }
  $systemId = $parts[0]
  Invoke-Checked (Join-Path $PostgresBin 'psql.exe') @($postgresUrl, '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE ROLE anon NOLOGIN;')
  Invoke-Checked (Join-Path $PostgresBin 'psql.exe') @($postgresUrl, '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE ROLE authenticated NOLOGIN;')
  Invoke-Checked (Join-Path $PostgresBin 'psql.exe') @($postgresUrl, '-v', 'ON_ERROR_STOP=1', '-c', "CREATE DATABASE $Database;")

  $connection = "postgresql://postgres@127.0.0.1:$Port/$Database?schema=public"
  $env:DATABASE_URL = $connection
  $env:DIRECT_URL = $connection
  $env:INVENTORY_CHECK_DATABASE_URL = $connection
  $env:JURISSIM_DEMO_MODE = 'true'
  $env:JURISSIM_DEMO_SYSTEM_ID = $systemId
  $env:NODE_ENV = 'development'
  Set-Content -LiteralPath $Shim -Encoding ascii -NoNewline -Value "const os=require('node:os'); os.userInfo=()=>({username:process.env.USERNAME||'local-runner'});"
  $env:NODE_OPTIONS = "--require=$Shim"

  Push-Location $Backend
  try {
    Invoke-Checked 'npm.cmd' @('exec', '--', 'prisma', 'migrate', 'deploy', '--schema=prisma/schema.prisma')
    Invoke-Checked 'npm.cmd' @('exec', '--', 'tsx', 'scripts/demo/seed-academic-demo.ts')
    Invoke-Checked 'npm.cmd' @('run', 'inventory:check')
  } finally { Pop-Location }

  $session = [ordered]@{ root = $Root; data = $Data; log = $Log; pgBin = [IO.Path]::GetFullPath($PostgresBin)
    port = $Port; database = $Database; systemIdentifier = $systemId; connection = $connection }
  $session | ConvertTo-Json | Set-Content -LiteralPath $SessionPath -Encoding utf8
  Write-Output "Demonstração pronta. PostgreSQL descartável: 127.0.0.1:$Port/$Database (somente loopback)."
  Write-Output "Conexão local para os comandos de backend: $connection"
  Write-Output "Registro sem credenciais: $SessionPath"
  Write-Output 'Contas e senha demonstrativa são impressas pelo carregador de fixtures.'
} catch {
  if ($Started) {
    & (Join-Path $PostgresBin 'pg_ctl.exe') -D $Data -m fast -w stop 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw 'Demo startup failed and PostgreSQL did not stop; temporary data was retained for safe manual inspection.'
    }
  }
  Remove-OwnTemporaryRoot
  throw
} finally {
  foreach ($name in @('DATABASE_URL', 'DIRECT_URL', 'INVENTORY_CHECK_DATABASE_URL', 'JURISSIM_DEMO_MODE', 'JURISSIM_DEMO_SYSTEM_ID', 'NODE_ENV', 'NODE_OPTIONS')) {
    Remove-Item "Env:$name" -ErrorAction SilentlyContinue
  }
  Set-Location $OriginalLocation
}
