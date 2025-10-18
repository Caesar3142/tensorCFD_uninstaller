const btn = document.getElementById('startBtn');
const logEl = document.getElementById('log');

const titleToId = {
  '#1 Uninstall WSL/Ubuntu (and OpenFOAM)': 's-1',
  '#2 Remove ParaView': 's-2',
  '#3 Remove Blender': 's-3',
  '#4 Remove tensorHVAC-Pro-2025 + shortcut': 's-4',
  '#5 Uninstall Tensor HVAC Licensing': 's-5',
  '#6 Remove Licensing leftovers + shortcuts': 's-6',
  '#7 Clean AppData Programs folders': 's-7',
  '#8 Clean desktop shortcuts': 's-8'
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

// Checklist inputs (new ones included)
const cbWSL = document.getElementById('cb-wsl');
const cbPV  = document.getElementById('cb-paraview');
const cbBL  = document.getElementById('cb-blender');
const cbAPP = document.getElementById('cb-app');
const cbLIC = document.getElementById('cb-licensing');
const cbLO  = document.getElementById('cb-leftovers');
const cbPROG = document.getElementById('cb-programs');
const cbSC   = document.getElementById('cb-shortcuts');

const btnAll = document.getElementById('checkAll');
const btnNone = document.getElementById('uncheckAll');

function setAll(val) {
  if (cbWSL) cbWSL.checked = val;
  if (cbPV)  cbPV.checked  = val;
  if (cbBL)  cbBL.checked  = val;
  if (cbAPP) cbAPP.checked = val;
  if (cbLIC) cbLIC.checked = val;
  if (cbLO)  cbLO.checked  = val;
  if (cbPROG) cbPROG.checked = val;
  if (cbSC)   cbSC.checked   = val;
}
if (btnAll) btnAll.addEventListener('click', () => setAll(true));
if (btnNone) btnNone.addEventListener('click', () => setAll(false));

btn.addEventListener('click', async () => {
  btn.disabled = true;
  logEl.textContent = '';
  Object.values(titleToId).forEach(id => setStatus(id, 'pending'));

  const selections = {
    wsl: cbWSL ? cbWSL.checked : true,
    paraview: cbPV ? cbPV.checked : true,
    blender: cbBL ? cbBL.checked : true,
    app: cbAPP ? cbAPP.checked : true,
    licensing: cbLIC ? cbLIC.checked : true,
    leftovers: cbLO ? cbLO.checked : true,
    programs: cbPROG ? cbPROG.checked : true,    // NEW
    shortcuts: cbSC ? cbSC.checked : true        // NEW
  };

  let result;
  try {
    result = await window.uninstaller.start({ confirm: false, selections });
  } catch (e) {
    // fallback for older preload (ignores selections)
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
