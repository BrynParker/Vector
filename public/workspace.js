// Native dialogs keep focus and return it to their opener on close.
export function initWorkspace({ onNavigate, onGlobalScope }) {
  const settings = document.getElementById('displaySettings');
  document.getElementById('settingsToggle').addEventListener('click', () => settings.showModal());
  document.getElementById('settingsClose').addEventListener('click', () => settings.close());
  settings.addEventListener('click', event => { if (event.target === settings) { const r = settings.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) settings.close(); } });
  document.getElementById('globalScopeBtn').addEventListener('click', onGlobalScope);
  for (const button of document.querySelectorAll('[data-workspace]')) {
    button.addEventListener('click', () => {
      for (const item of document.querySelectorAll('[data-workspace]')) {
        item.classList.toggle('active', item === button);
        item.setAttribute('aria-pressed', String(item === button));
      }
      onNavigate(button.dataset.workspace);
    });
  }
}
