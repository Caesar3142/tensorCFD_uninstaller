const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 640,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
    title: "tensorCFD Uninstaller"
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
        resolve(); // continue anyway to keep uninstaller resilient
      }
    });
  });
}

/**
 * Build a robust PowerShell that:
 * - Searches both 64-bit and 32-bit uninstall registry hives.
 * - Filters entries whose DisplayName starts with "Tensor HVAC Licensing".
 * - Executes UninstallString elevated and silently if possible.
 *   - Adds /quiet for msiexec, or /S for typical EXE installers if not present.
 */
function getLicensingUninstallPS() {
  // The script writes progress to stdout; any failures are treated as warnings by runCmd wrapper.
  return `
$ErrorActionPreference = 'SilentlyContinue'
$paths = @(
  'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
  'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'
)
$apps = Get-ItemProperty -Path $paths -ErrorAction SilentlyContinue | Where-Object {
  $_.DisplayName -like 'Tensor HVAC Licensing*'
}

if (-not $apps) {
  Write-Output 'No "Tensor HVAC Licensing" uninstall entries found.'
  exit 0
}

foreach ($a in $apps) {
  $name = $a.DisplayName
  $uninst = $a.UninstallString
  if (-not $uninst) { Write-Output "No UninstallString for $name"; continue }

  Write-Output "Found uninstall for: $name"
  # Normalize
  if ($uninst -match 'msiexec(\\.exe)?\\s*/I|msiexec(\\.exe)?\\s*/X|msiexec(\\.exe)?\\s*/package|msiexec(\\.exe)?\\s*/product') {
    # Ensure it's an uninstall; add /X if not present, then /quiet if missing.
    if ($uninst -notmatch '/X') { $uninst = $uninst -replace '/I','/X' }
    if ($uninst -notmatch '/quiet' -and $uninst -notmatch '/qn') { $uninst = "$uninst /quiet" }
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c $uninst" -Verb RunAs -Wait
  } else {
    # Split EXE and ARGS if quoted
    if ($uninst -match '^\\"([^\\"]+)\\"(.*)$') {
      $exe = $Matches[1]
      $args = $Matches[2].Trim()
    } elseif ($uninst -match '^([^\\s]+)\\s*(.*)$') {
      $exe = $Matches[1]
      $args = $Matches[2].Trim()
    } else {
      $exe = $uninst
      $args = ''
    }
    if ($args -notmatch '/S' -and $args -notmatch '/silent' -and $args -notmatch '/quiet') {
      $args = ($args + ' /S').Trim()
    }
    Start-Process -FilePath $exe -ArgumentList $args -Verb RunAs -Wait
  }
}
`;
}

ipcMain.handle('start-uninstall', async (_e, { confirm }) => {
  if (!confirm) {
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

  const licensingPS = getLicensingUninstallPS();
  const steps = [
    {
      title: '#1 Uninstall WSL/Ubuntu (and OpenFOAM)',
      cmd: `wsl --terminate Ubuntu & wsl --unregister Ubuntu & rmdir /s /q C:\\WSL\\Ubuntu 2>nul`
    },
    {
      title: '#2 Remove ParaView',
      cmd: `rmdir /s /q "C:\\tensorCFD\\tensorHVAC-Pro-2025\\ParaView-6.0.1-Windows-Python3.12-msvc2017-AMD64" 2>nul & del /q paraview.zip 2>nul`
    },
    {
      title: '#3 Remove Blender',
      cmd: `rmdir /s /q "C:\\tensorCFD\\tensorHVAC-Pro-2025\\blender-4.5.3-windows-x64" 2>nul & del /q blender.zip 2>nul`
    },
    {
      title: '#4 Remove tensorHVAC-Pro-2025 + shortcut',
      cmd: `del /q "C:\\tensorCFD\\tensorHVAC-Pro-2025\\tensorHVAC-Pro-2025.exe" 2>nul & del /q "%USERPROFILE%\\Desktop\\*tensorHVAC*2025*.lnk" 2>nul`
    },
    {
      title: '#5 Uninstall Tensor HVAC Licensing',
      cmd: `powershell -NoProfile -ExecutionPolicy Bypass -Command "${licensingPS.replace(/"/g, '\\"')}"`
    },
    {
      title: '#6 Remove Licensing leftovers + shortcuts',
      cmd: `rmdir /s /q "C:\\tensorCFD\\Licensing" 2>nul & del /q "%USERPROFILE%\\Desktop\\*Tensor*HVAC*Licens*.lnk" 2>nul`
    }
  ];

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
