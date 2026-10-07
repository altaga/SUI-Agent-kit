# sui-agent-kit installer for Windows 10/11 (x64 / arm64), PowerShell 5.1+.
# No admin rights, nothing global: everything goes to %USERPROFILE%\.sui-agent-kit (delete it to uninstall).
# If Node.js >= 22 is missing, an official Node zip is downloaded into that folder.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Repo = if ($env:AGENT_KIT_REPO) { $env:AGENT_KIT_REPO } else { "altaga/sui-agent-kit" }
$Ref  = if ($env:AGENT_KIT_REF) { $env:AGENT_KIT_REF } else { "main" }
$Base = if ($env:AGENT_KIT_HOME) { $env:AGENT_KIT_HOME } else { Join-Path $env:USERPROFILE ".sui-agent-kit" }
$App = Join-Path $Base "app"; $Bin = Join-Path $Base "bin"; $NodeDir = Join-Path $Base "node"
New-Item -ItemType Directory -Force -Path $Base, $Bin | Out-Null

function Node-Major($exe) { try { [int](& $exe -p "process.versions.node.split('.')[0]") } catch { 0 } }

$Node = $null
$sys = Get-Command node -ErrorAction SilentlyContinue
if ($sys -and (Node-Major $sys.Source) -ge 22) { $Node = $sys.Source }
elseif ((Test-Path "$NodeDir\node.exe") -and (Node-Major "$NodeDir\node.exe") -ge 22) { $Node = "$NodeDir\node.exe" }
else {
  Write-Host "Node.js >= 22 not found; downloading a private copy to $NodeDir"
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
  $idx = "https://nodejs.org/dist/latest-v22.x"
  $sums = (Invoke-WebRequest "$idx/SHASUMS256.txt" -UseBasicParsing).Content -split "`n"
  $line = $sums | Where-Object { $_ -match " node-v22\.[0-9.]+-win-$arch\.zip\s*$" } | Select-Object -First 1
  if (-not $line) { throw "No Node.js build for win-$arch" }
  $sum, $file = ($line.Trim() -split "\s+")
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("ska-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $tmp | Out-Null
  Invoke-WebRequest "$idx/$file" -OutFile "$tmp\node.zip" -UseBasicParsing
  if ((Get-FileHash "$tmp\node.zip" -Algorithm SHA256).Hash.ToLower() -ne $sum) { throw "Node.js checksum mismatch" }
  Expand-Archive "$tmp\node.zip" -DestinationPath $tmp
  if (Test-Path $NodeDir) { Remove-Item -Recurse -Force $NodeDir }
  Move-Item (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName $NodeDir
  Remove-Item -Recurse -Force $tmp
  $Node = "$NodeDir\node.exe"
}
$NodeBin = Split-Path $Node
Write-Host "Using Node $(& $Node -v) ($Node)"

Write-Host "Downloading sui-agent-kit ($Repo@$Ref)"
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("ska-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
Invoke-WebRequest "https://codeload.github.com/$Repo/zip/refs/heads/$Ref" -OutFile "$tmp\src.zip" -UseBasicParsing
Expand-Archive "$tmp\src.zip" -DestinationPath $tmp
if (Test-Path $App) { Remove-Item -Recurse -Force $App }
Move-Item (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName $App
Remove-Item -Recurse -Force $tmp

Write-Host "Installing dependencies (no native modules, no build step)"
Push-Location $App
$env:PATH = "$NodeBin;$env:PATH"
& "$NodeBin\npm.cmd" install --omit=dev --no-audit --no-fund --loglevel=error
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
Pop-Location

Set-Content -Path "$Bin\agent.cmd" -Encoding ASCII -Value "@echo off`r`n`"$Node`" `"$App\bin\agent.mjs`" %*"

Write-Host ""
& "$Bin\agent.cmd" doctor
Write-Host ""
Write-Host "Installed. Start with:  $Bin\agent.cmd"
Write-Host "For the short name 'agent' run:  setx PATH `"$Bin;%PATH%`"   (then open a new terminal)"
Write-Host "Model access: set ANTHROPIC_API_KEY (or AWS credentials for Claude on Bedrock). Uninstall: delete $Base"
