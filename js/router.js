// =====================================================
// ZAMORA MSG — SPA Router
// =====================================================

const routes = {};
let currentPage = null;

export const router = {
  register(name, initFn) {
    routes[name] = initFn;
  },

  navigate(page, params = {}) {
    // Hide current page
    if (currentPage) {
      const prev = document.getElementById(`${currentPage}-page`);
      if (prev) { prev.classList.remove('active'); prev.style.display = 'none'; }
    }

    // Show new page
    const el = document.getElementById(`${page}-page`);
    if (!el) { console.warn(`Page not found: ${page}`); return; }
    el.style.display = 'flex';
    requestAnimationFrame(() => {
      el.classList.add('active');
    });
    currentPage = page;

    // Update URL hash
    window.location.hash = page + (Object.keys(params).length ? '/' + JSON.stringify(params) : '');

    // Update nav highlights
    updateNavActive(page);

    // Init page if handler exists
    if (routes[page]) routes[page](params);

    // Scroll to top
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.scrollTop = 0;
  },

  getCurrent() {
    return currentPage;
  }
};

export function updateNavActive(page) {
  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });
}

export function initRouter() {
  // Handle nav item clicks
  document.querySelectorAll('[data-page]').forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      if (page) router.navigate(page);
    });
  });

  // Handle hash change
  window.addEventListener('hashchange', handleHash);
}

function handleHash() {
  const hash = window.location.hash.slice(1);
  if (!hash) return;
  const [page] = hash.split('/');
  if (page && routes[page] !== undefined && page !== currentPage) {
    router.navigate(page);
  }
}
