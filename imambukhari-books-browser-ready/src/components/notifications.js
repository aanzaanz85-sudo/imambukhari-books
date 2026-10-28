export function notify(message, type = 'info') {
  const host = document.querySelector('#notifications');
  if (!host) { window.alert(message); return; }
  const item = document.createElement('div');
  item.className = `toast toast-${type}`;
  item.textContent = message;
  host.append(item);
  window.setTimeout(() => item.remove(), 4200);
}
