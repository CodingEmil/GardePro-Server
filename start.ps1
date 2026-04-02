<#
.SYNOPSIS
Startet das GardePro Gallery Projekt.

.DESCRIPTION
Dieses Skript startet sowohl den Python Flask Server als auch die Vite/React Frontend-Entwicklungsumgebung.
#>

$BasePath = $PSScriptRoot

Write-Host "Starte GardePro Gallery..." -ForegroundColor Cyan

# Prüfe, ob Python installiert ist
if (!(Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "Python ist nicht installiert oder nicht im PATH. Bitte Python installieren." -ForegroundColor Red
    exit 1
}

# Installiere Python-Abhängigkeiten
Write-Host "Installiere Python-Abhängigkeiten..." -ForegroundColor Yellow
Start-Process -FilePath "python" -ArgumentList "-m pip install -r `"$BasePath\requirements.txt`"" -Wait -NoNewWindow

# Starte Python-Server asynchron im Hintergrund
Write-Host "Starte Python Flask Server (server.py)..." -ForegroundColor Yellow
$PythonProcess = Start-Process -FilePath "python" -ArgumentList "`"$BasePath\server.py`"" -PassThru

# Prüfe, ob Node.js/npm installiert ist
if (!(Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "npm (Node.js) ist nicht installiert oder nicht im PATH. Bitte Node.js installieren." -ForegroundColor Red
    # Wir killen den Python-Prozess hier zur Sicherheit, falls node fehlt
    Stop-Process -Id $PythonProcess.Id -Force
    exit 1
}

# Gehe in den frontend Ordner und starte npm run dev
Write-Host "Installiere npm-Pakete und starte Vite Frontend..." -ForegroundColor Yellow
Set-Location "$BasePath\frontend"
Start-Process -FilePath "npm.cmd" -ArgumentList "install" -Wait -NoNewWindow

Write-Host "Starte Frontend (Vite)..." -ForegroundColor Green
$NpmProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "run dev" -PassThru

Write-Host "Das Projekt sollte nun laufen. Du kannst die Prozesse beenden, indem du dieses Fenster schließt." -ForegroundColor Cyan

try {
    # Warte solange, bis der User abbricht oder einer der Prozesse crasht
    if ($null -ne $NpmProcess.Id -and $null -ne $PythonProcess.Id) {
        Wait-Process -Id $PythonProcess.Id, $NpmProcess.Id
    } elseif ($null -ne $PythonProcess.Id) {
        Wait-Process -Id $PythonProcess.Id
    } elseif ($null -ne $NpmProcess.Id) {
        Wait-Process -Id $NpmProcess.Id
    }
} finally {
    Write-Host "Beende Prozesse..." -ForegroundColor Yellow
    if ($null -ne $PythonProcess -and !$PythonProcess.HasExited) { Stop-Process -Id $PythonProcess.Id -Force }
    if ($null -ne $NpmProcess -and !$NpmProcess.HasExited) { Stop-Process -Id $NpmProcess.Id -Force }
}
