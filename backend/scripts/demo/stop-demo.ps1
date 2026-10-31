$ErrorActionPreference = 'Stop'
$SessionPath = Join-Path $env:TEMP 'jurissim-academic-demo-session.json'
if (-not (Test-Path -LiteralPath $SessionPath)) { throw 'No JurisSim academic demo session is registered.' }
$session = Get-Content -LiteralPath $SessionPath -Raw | ConvertFrom-Json
$temp = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')
$root = [IO.Path]::GetFullPath([string]$session.root)
$expectedRoot = Join-Path $temp ([string](Split-Path -Leaf $root))
if ($root -ne $expectedRoot -or (Split-Path -Leaf $root) -notmatch '^jurissim-academic-demo-[0-9a-f]{32}$') {
  throw 'Refusing cleanup: the registered cluster path is outside its expected temporary location.'
}
$rootItem = Get-Item -LiteralPath $root -Force
if (($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw 'Refusing cleanup: the temporary cluster root is a reparse point.'
}
$data = [IO.Path]::GetFullPath([string]$session.data)
if ($data -ne [IO.Path]::GetFullPath((Join-Path $root 'pgdata')) -or [int]$session.port -ne 55432 -or $session.database -ne 'jurissim_demo') {
  throw 'Refusing cleanup: registered cluster metadata does not match the demo layout.'
}
$dataItem = Get-Item -LiteralPath $data -Force
if (($dataItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $data 'PG_VERSION'))) {
  throw 'Refusing cleanup: the PostgreSQL data directory is missing or redirected.'
}
$psql = Join-Path ([string]$session.pgBin) 'psql.exe'
$pgctl = Join-Path ([string]$session.pgBin) 'pg_ctl.exe'
if (-not (Test-Path -LiteralPath $psql) -or -not (Test-Path -LiteralPath $pgctl)) { throw 'Cannot verify the registered PostgreSQL instance.' }
$url = 'postgresql://postgres@127.0.0.1:55432/postgres'
$identity = & $psql $url -Atc "SELECT (pg_control_system()).system_identifier::text || '|' || inet_server_addr()::text || '|' || inet_server_port()::text"
if ($LASTEXITCODE -ne 0) { throw 'Could not verify the running PostgreSQL identity; no cleanup performed.' }
if ($identity -ne "$($session.systemIdentifier)|127.0.0.1/32|55432") { throw 'Refusing cleanup: the server identity does not match this disposable session.' }
& $pgctl -D $data -m fast -w stop
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL did not stop; temp files were retained.' }
$fullTemp = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')
if ((Split-Path -Parent $root) -ne $fullTemp) { throw 'Refusing cleanup: resolved directory parent changed.' }
Remove-Item -LiteralPath $root -Recurse -Force
Remove-Item -LiteralPath $SessionPath -Force
Write-Output 'PostgreSQL descartável parado e somente seu diretório temporário removido.'
