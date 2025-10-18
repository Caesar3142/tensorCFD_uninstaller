const btn = document.getElementById('startBtn');
const logEl = document.getElementById('log');

const titleToId = {
  '#1 Uninstall WSL/Ubuntu (and OpenFOAM)': 's-1',
  '#2 Remove ParaView': 's-2',
  '#3 Remove Blender': 's-3',
  '#4 Remove tensorHVAC-Pro-2025 + shortcut': 's-4',
  '#5 Uninstall Tensor HVAC Licensing': 's-5',
  '#6 Remove Licensing leftovers + shortcuts': 's-6'
};

function setStatus(id, status) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = status;
  el.classList.remove('running', 'done', 'error');
  if (status === 'running') el.classList.add('running');
  if (status === 'done') el.classList.add('done');
  if (status === 'error') el.classList.add('error');
}

// Optional checklist inputs (will be null if you haven't added the checkboxes yet)
const cbWSL = document.getElementById('cb-wsl');
const cbPV  = document.getElementById('cb-paraview');
const cbBL  = document.getElementById('cb-blender');
const cbAPP = document.getElementById('cb-app');
const cbLIC = document.getElementById('cb-licensing');
const cbLO  = document.getElementById('cb-leftovers');

btn.addEventListener('click', async () => {
  btn.disabled = true;
  logEl.textContent = '';
  Object.values(titleToId).forEach(id => setStatus(id, 'pending'));

  // Build selections if checkboxes exist; else default to "all true" (back-compat)
  const selections = {
    wsl: cbWSL ? cbWSL.checked : true,
    paraview: cbPV ? cbPV.checked : true,
    blender: cbBL ? cbBL.checked : true,
    app: cbAPP ? cbAPP.checked : true,
    licensing: cbLIC ? cbLIC.checked : true,
    leftovers: cbLO ? cbLO.checked : true
  };

  let result;
  try {
    // Preferred (new) call shape: pass an options object
    result = await window.uninstaller.start({ confirm: false, selections });
  } catch (e) {
    // Fallback for older preload that only accepts a boolean
    // (Selections will be ignored in that mode.)
    result = await window.uninstaller.start(false);
  }

  if (result && result.canceled) {
    btn.disabled = false;
    return;
  }
  if (!result || !result.ok) {
    alert('Uninstall finished with warnings/errors. Check the log.');
  } else {
    alert('Uninstall complete.');
  }
  btn.disabled = false;
});

window.uninstaller.onLog((line) => {
  logEl.textContent += line;
  logEl.scrollTop = logEl.scrollHeight;
});

window.uninstaller.onStep(({ title, status }) => {
  const id = titleToId[title];
  if (id) setStatus(id, status);
});
