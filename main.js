const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 640,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
    title: "tensorHVAC-2025.1.2 Uninstaller"
  });
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function sendLog(line = "") {
  if (win && win.webContents) win.webContents.send('log', line.toString());
}
function sendStep(title, status) {
  if (win && win.webContents) win.webContents.send('step', { title, status });
}

function runCmd(title, command, shell = true) {
  return new Promise((resolve) => {
    sendStep(title, 'running');
    const child = spawn(command, { shell });

    child.stdout.on('data', d => sendLog(d));
    child.stderr.on('data', d => sendLog(d));

    child.on('close', code => {
      if (code === 0) {
        sendStep(title, 'done');
        resolve();
      } else {
        // Many deletions use 2>nul; treat nonzero as warning so the flow continues.
        sendLog(`\n[WARN] "${title}" exited with code ${code}. Continuing.\n`);
        sendStep(title, 'done');
        resolve();
      }
    });
  });
}

/**
 * PowerShell to uninstall "Tensor HVAC Licensing" (and legacy Launcher names)
 */
function getLicensingUninstallPS() {
  return `
$ErrorActionPreference = 'SilentlyContinue'
$paths = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$apps = Get-ItemProperty -Path $paths -ErrorAction SilentlyContinue | Where-Object {
  $_.DisplayName -like 'Tensor HVAC Licensing*' -or $_.DisplayName -like 'Launcher tensorHVAC-Pro*'
}

if (-not $apps) {
  Write-Output 'No matching Tensor HVAC Licensing uninstall entries found.'
  exit 0
}

foreach ($a in $apps) {
  $name = $a.DisplayName
  $uninst = $a.UninstallString
  if (-not $uninst) { Write-Output "No UninstallString for $name"; continue }

  Write-Output "Found uninstall for: $name"
  if ($uninst -match 'msiexec(\\.exe)?\\s*/I|msiexec(\\.exe)?\\s*/X|msiexec(\\.exe)?\\s*/package|msiexec(\\.exe)?\\s*/product') {
    if ($uninst -notmatch '/X') { $uninst = $uninst -replace '/I','/X' }
    if ($uninst -notmatch '/quiet' -and $uninst -notmatch '/qn') { $uninst = "$uninst /quiet" }
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c $uninst" -Verb RunAs -Wait
  } else {
    if ($uninst -match '^\\"([^\\"]+)\\"(.*)$') {
      $exe = $Matches[1]; $args = $Matches[2].Trim()
    } elseif ($uninst -match '^([^\\s]+)\\s*(.*)$') {
      $exe = $Matches[1]; $args = $Matches[2].Trim()
    } else { $exe = $uninst; $args = '' }
    if ($args -notmatch '/S' -and $args -notmatch '/silent' -and $args -notmatch '/quiet') {
      $args = ($args + ' /S').Trim()
    }
    Start-Process -FilePath $exe -ArgumentList $args -Verb RunAs -Wait
  }
}
`;
}

/** PowerShell to clean %LOCALAPPDATA%\Programs for tensorHVAC-related folders */
function getProgramsCleanupPS() {
  return `
$ErrorActionPreference = 'SilentlyContinue'
$base = Join-Path $env:LOCALAPPDATA 'Programs'
if (-not (Test-Path $base)) {
  Write-Output "Programs folder not found: $base"
  exit 0
}

$patterns = @(
  'tensorHVAC*',
  'TensorHVAC*',
  'Tensor HVAC*',
  'tensorCFD*'
)

foreach ($pat in $patterns) {
  $targets = Get-ChildItem -Path $base -Directory -Filter $pat -ErrorAction SilentlyContinue
  foreach ($t in $targets) {
    Write-Output "Removing: $($t.FullName)"
    Remove-Item -LiteralPath $t.FullName -Recurse -Force -ErrorAction SilentlyContinue
  }
}
`;
}

/** PowerShell to sweep all desktop shortcuts that match tensorHVAC */
function getDesktopShortcutsCleanupPS() {
  return `
$ErrorActionPreference = 'SilentlyContinue'
$desktop = Join-Path $env:USERPROFILE 'Desktop'
if (-not (Test-Path $desktop)) {
  Write-Output "Desktop not found: $desktop"
  exit 0
}

$patterns = @(
  '*tensor*hvac*.lnk',   # generic tensor+hvac match
  'tensorHVAC-2025-Launcher.lnk',  # explicit new launcher name
  '*Tensor*HVAC*Licens*.lnk',      # licensing shortcuts
  '*tensorHVAC*2025*.lnk'          # legacy names
)

foreach ($pat in $patterns) {
  $links = Get-ChildItem -Path $desktop -File -Filter $pat -ErrorAction SilentlyContinue
  foreach ($l in $links) {
    Write-Output "Deleting shortcut: $($l.FullName)"
    Remove-Item -LiteralPath $l.FullName -Force -ErrorAction SilentlyContinue
  }
}
`;
}

ipcMain.handle('start-uninstall', async (_e, opts = {}) => {
  if (!opts.confirm) {
    const res = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Cancel', 'Uninstall'],
      defaultId: 1,
      cancelId: 0,
      title: 'Confirm Uninstall',
      message: 'This will remove WSL Ubuntu (and OpenFOAM), ParaView, Blender, tensorHVAC-Pro-2025, and Tensor HVAC Licensing including shortcuts.',
      detail: 'Action is irreversible. Proceed?'
    });
    if (res !== 1) return { ok: false, canceled: true };
  }

  // Defaults: uninstall everything (back-compat). New flags: programs, shortcuts.
  const selections = {
    wsl: true,
    paraview: true,
    blender: true,
    app: true,
    licensing: true,
    leftovers: true,
    programs: true,   // NEW #7
    shortcuts: true,  // NEW #8
    ...(opts.selections || {})
  };

  // Log summary
  sendLog('--- Uninstall Selection Summary ---\n');
  sendLog(`WSL/Ubuntu (#1): ${selections.wsl ? 'ON' : 'OFF'}\n`);
  sendLog(`ParaView (#2):    ${selections.paraview ? 'ON' : 'OFF'}\n`);
  sendLog(`Blender (#3):     ${selections.blender ? 'ON' : 'OFF'}\n`);
  sendLog(`App/Shortcut (#4):${selections.app ? 'ON' : 'OFF'}\n`);
  sendLog(`Licensing (#5):   ${selections.licensing ? 'ON' : 'OFF'}\n`);
  sendLog(`Leftovers (#6):   ${selections.leftovers ? 'ON' : 'OFF'}\n`);
  sendLog(`Programs (#7):    ${selections.programs ? 'ON' : 'OFF'}\n`);
  sendLog(`Shortcuts (#8):   ${selections.shortcuts ? 'ON' : 'OFF'}\n`);
  sendLog('-----------------------------------\n\n');

  const licensingPS = getLicensingUninstallPS();
  const programsPS = getProgramsCleanupPS();
  const desktopPS  = getDesktopShortcutsCleanupPS();

  const steps = [];
  if (selections.wsl) {
    steps.push({
      title: '#1 Uninstall WSL/Ubuntu (and OpenFOAM)',
      cmd: `wsl --terminate Ubuntu & wsl --unregister Ubuntu & rmdir /s /q C:\\WSL\\Ubuntu 2>nul`
    });
  }
  if (selections.paraview) {
    steps.push({
      title: '#2 Remove ParaView',
      cmd: `rmdir /s /q "C:\\tensorCFD\\tensorHVAC-Pro-2025\\ParaView-6.0.1-Windows-Python3.12-msvc2017-AMD64" 2>nul & del /q paraview.zip 2>nul`
    });
  }
  if (selections.blender) {
    steps.push({
      title: '#3 Remove Blender',
      cmd: `rmdir /s /q "C:\\tensorCFD\\tensorHVAC-Pro-2025\\blender-4.5.3-windows-x64" 2>nul & del /q blender.zip 2>nul`
    });
  }
  if (selections.app) {
    steps.push({
      title: '#4 Remove tensorHVAC-Pro-2025 + shortcut',
      cmd: `del /q "C:\\tensorCFD\\tensorHVAC-Pro-2025\\tensorHVAC-Pro-2025.exe" 2>nul & del /q "%USERPROFILE%\\Desktop\\*tensorHVAC*2025*.lnk" 2>nul & del /q "%USERPROFILE%\\Desktop\\tensorHVAC-2025-Launcher.lnk" 2>nul`
    });
  }
  if (selections.licensing) {
    steps.push({
      title: '#5 Uninstall Tensor HVAC Licensing',
      cmd: `powershell -NoProfile -ExecutionPolicy Bypass -Command "${licensingPS.replace(/"/g, '\\"')}"`
    });
  }
  if (selections.leftovers) {
    steps.push({
      title: '#6 Remove Licensing leftovers + shortcuts',
      cmd: `rmdir /s /q "C:\\tensorCFD\\tensorHVAC-Pro-2025" 2>nul & del /q "%USERPROFILE%\\Desktop\\*Tensor*HVAC*Licens*.lnk" 2>nul & del /q "%USERPROFILE%\\Desktop\\tensorHVAC-2025-Launcher.lnk" 2>nul`
    });
  }
  if (selections.programs) {
    steps.push({
      title: '#7 Clean AppData Programs folders',
      cmd: `powershell -NoProfile -ExecutionPolicy Bypass -Command "${programsPS.replace(/"/g, '\\"')}"`
    });
  }
  if (selections.shortcuts) {
    steps.push({
      title: '#8 Clean desktop shortcuts',
      cmd: `powershell -NoProfile -ExecutionPolicy Bypass -Command "${desktopPS.replace(/"/g, '\\"')}"`
    });
  }

  try {
    sendLog('Starting uninstall...\n\n');

    for (const s of steps) {
      sendLog(`==> ${s.title}\n`);
      await runCmd(s.title, s.cmd);
      sendLog('\n');
    }

    sendLog('✅ Uninstall completed.\n');
    return { ok: true };
  } catch (err) {
    sendLog(`\n❌ Error: ${err.message}\n`);
    return { ok: false, error: err.message };
  }
});
