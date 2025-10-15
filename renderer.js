const btn = document.getElementById('startBtn');
const logEl = document.getElementById('log');

const titleToId = {
  '#1 Uninstall WSL/Ubuntu (and OpenFOAM)': 's-1',
  '#2 Remove ParaView': 's-2',
  '#3 Remove Blender': 's-3',
  '#4 Remove tensorHVAC-Pro-2025 + shortcut': 's-4'
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

btn.addEventListener('click', async () => {
  btn.disabled = true;
  logEl.textContent = '';
  Object.values(titleToId).forEach(id => setStatus(id, 'pending'));

  const result = await window.uninstaller.start(false);
  if (result.canceled) {
    btn.disabled = false;
    return;
  }
  if (!result.ok) {
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
