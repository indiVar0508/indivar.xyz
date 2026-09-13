const themeButton = document.querySelector('.theme-toggle');
const updateThemeLabel = () => {
  themeButton.setAttribute('aria-label', `Switch to ${document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'} theme`);
};
themeButton.hidden = false;
updateThemeLabel();
themeButton.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('theme', theme); } catch (_) {}
  updateThemeLabel();
});

document.querySelectorAll('[data-filter-section]').forEach(section => {
  const controls = section.querySelector('[data-controls]');
  const buttons = [...section.querySelectorAll('[data-filter]')];
  const items = [...section.querySelectorAll('[data-item]')];
  const search = section.querySelector('[data-search-input]');
  let category = 'all';
  const filter = () => {
    const query = search?.value.trim().toLowerCase() || '';
    let count = 0;
    items.forEach(item => {
      item.hidden = !(category === 'all' || item.dataset.category === category) || !item.dataset.search.includes(query);
      if (!item.hidden) count++;
    });
    section.querySelector('[data-empty]').hidden = count > 0;
    section.querySelector('[data-results]').textContent = `${count} ${count === 1 ? 'result' : 'results'}`;
  };
  controls.hidden = false;
  buttons.forEach(button => button.addEventListener('click', () => {
    category = button.dataset.filter;
    buttons.forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    filter();
  }));
  search?.addEventListener('input', filter);
});

// Preserve links shared by the original hash-based site.
const base = new URL('../', document.currentScript.src);
const legacyRoutes = { '#blog': 'blog/', '#post/hello-world': 'blog/hello-world/', '#about': 'about/', '#oss': 'work/#oss' };
const redirectLegacyRoute = () => {
  if (location.pathname === base.pathname && legacyRoutes[location.hash]) location.replace(new URL(legacyRoutes[location.hash], base));
};
redirectLegacyRoute();
window.addEventListener('hashchange', redirectLegacyRoute);
