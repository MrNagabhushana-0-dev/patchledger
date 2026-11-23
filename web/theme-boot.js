// Applies the remembered theme before first paint. Classic script loaded
// before the stylesheet so there is no flash of the wrong theme.
try {
  document.documentElement.dataset.theme = localStorage.getItem('patchledger-theme') || 'dark';
} catch {
  document.documentElement.dataset.theme = 'dark';
}
