// =====================================================
// ZAMORA MSG — UI Utilities (Toast, Modal, Loader)
// =====================================================

/* ── Toast System ── */
const toastContainer = document.getElementById('toast-container');

export function showToast(message, type = 'info', duration = 3500) {
  const icons = { success: '[✓]', error: '[✕]', info: '[i]', warning: '[!]' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-exit');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

/* ── Modal System ── */
let activeModalBackdrop = null;

export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.classList.add('animate-fade-in');
  activeModalBackdrop = modal;
  document.body.style.overflow = 'hidden';
}

export function closeModal(modalId) {
  const modal = modalId ? document.getElementById(modalId) : activeModalBackdrop;
  if (!modal) return;
  modal.classList.add('hidden');
  document.body.style.overflow = '';
  activeModalBackdrop = null;
}

export function createModal({ id, title, content, footer = '', size = 'default' }) {
  const maxWidth = size === 'lg' ? '640px' : size === 'sm' ? '380px' : '480px';
  const html = `
    <div id="${id}" class="modal-backdrop hidden">
      <div class="modal-box" style="max-width:${maxWidth}">
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          <div class="modal-close" onclick="closeModalById('${id}')">✕</div>
        </div>
        <div class="modal-body">${content}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
}

// Global helper for inline onclick
window.openModal = openModal;
window.closeModalById = closeModal;
window.closeModal = closeModal;  // Alias para facilitar uso en HTML

// Close on backdrop click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.add('hidden');
    document.body.style.overflow = '';
  }
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && activeModalBackdrop) {
    activeModalBackdrop.classList.add('hidden');
    document.body.style.overflow = '';
    activeModalBackdrop = null;
  }
});

/* ── Loading States ── */
export function setButtonLoading(btn, loading, originalText = '') {
  if (loading) {
    btn.dataset.originalText = btn.innerHTML;
    btn.innerHTML = `<span class="btn-spinner"></span> Cargando...`;
    btn.classList.add('btn-loading');
    btn.disabled = true;
  } else {
    btn.innerHTML = originalText || btn.dataset.originalText || 'Listo';
    btn.classList.remove('btn-loading');
    btn.disabled = false;
  }
}

/* ── Confirm Dialog ── */
export function confirmDialog(message, onConfirm, options = {}) {
  const {
    title        = '¿Estás seguro?',
    confirmText  = 'Confirmar',
    cancelText   = 'Cancelar',
    danger       = false
  } = options;

  const id = 'confirm-modal-' + Date.now();
  const btnClass = danger ? 'btn-danger' : 'btn-primary';

  const backdrop = document.createElement('div');
  backdrop.id = id;
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-box" style="max-width:380px;text-align:center">
      <div style="font-size:2.5rem;margin-bottom:12px">⚠️</div>
      <h3 class="modal-title" style="margin-bottom:8px">${title}</h3>
      <p style="color:var(--text-secondary);font-size:0.9rem;margin-bottom:24px">${message}</p>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-full" id="cancel-${id}">${cancelText}</button>
        <button class="btn ${btnClass} btn-full" id="confirm-${id}">${confirmText}</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  document.getElementById(`cancel-${id}`).onclick  = () => { backdrop.remove(); document.body.style.overflow = ''; };
  document.getElementById(`confirm-${id}`).onclick = () => { backdrop.remove(); document.body.style.overflow = ''; onConfirm(); };
  backdrop.onclick = (e) => { if (e.target === backdrop) { backdrop.remove(); document.body.style.overflow = ''; }};
}

/* ── Avatar Placeholder ── */
export function getAvatarHTML(user, size = 'md', extraClass = '') {
  if (user?.photoURL) {
    return `<img src="${user.photoURL}" class="avatar avatar-${size} ${extraClass}" alt="${user.displayName || 'User'}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div class="avatar avatar-${size} avatar-placeholder ${extraClass}" style="display:none">${(user.displayName||'?')[0].toUpperCase()}</div>`;
  }
  return `<div class="avatar avatar-${size} avatar-placeholder ${extraClass}">${(user?.displayName||'?')[0].toUpperCase()}</div>`;
}

/* ── Format time ── */
export function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now  = new Date();
  const diff = now - date;
  const min  = Math.floor(diff / 60000);
  const hr   = Math.floor(diff / 3600000);
  const day  = Math.floor(diff / 86400000);
  if (min < 1)   return 'ahora';
  if (min < 60)  return `${min}m`;
  if (hr  < 24)  return `${hr}h`;
  if (day < 7)   return `${day}d`;
  return date.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
}

/* ── Image Lightbox ── */
export function openImageLightbox(src, alt = '') {
  const existing = document.getElementById('lightbox');
  if (existing) existing.remove();
  const lb = document.createElement('div');
  lb.id = 'lightbox';
  lb.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:600;display:flex;align-items:center;justify-content:center;cursor:zoom-out;animation:fadeIn 0.2s ease`;
  lb.innerHTML = `<img src="${src}" alt="${alt}" style="max-width:95vw;max-height:95vh;object-fit:contain;border-radius:8px;box-shadow:0 0 60px rgba(0,0,0,0.8)">
    <button style="position:absolute;top:16px;right:16px;background:rgba(0,0,0,0.5);border:none;color:#fff;width:40px;height:40px;border-radius:50%;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center" onclick="document.getElementById('lightbox').remove()">✕</button>`;
  lb.onclick = (e) => { if (e.target === lb) lb.remove(); };
  document.body.appendChild(lb);
}
window.openImageLightbox = openImageLightbox;

/* ── Tabs ── */
export function initTabs(containerSelector) {
  const containers = document.querySelectorAll(containerSelector);
  containers.forEach(container => {
    const tabs   = container.querySelectorAll('.tab-btn');
    const panels = container.querySelectorAll('.tab-panel');
    tabs.forEach(tab => {
      tab.onclick = () => {
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const target = container.querySelector(`#${tab.dataset.target}`);
        if (target) target.classList.add('active');
      };
    });
  });
}

/* ── Skeleton Loader ── */
export function createSkeletonPost() {
  return `
    <div class="post-card">
      <div class="post-header">
        <div class="skeleton" style="width:44px;height:44px;border-radius:50%"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:6px;padding:4px">
          <div class="skeleton" style="width:140px;height:12px;border-radius:4px"></div>
          <div class="skeleton" style="width:90px;height:10px;border-radius:4px"></div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin:8px 0">
        <div class="skeleton" style="width:100%;height:12px;border-radius:4px"></div>
        <div class="skeleton" style="width:80%;height:12px;border-radius:4px"></div>
      </div>
      <div class="skeleton" style="width:100%;height:200px;border-radius:12px;margin-top:8px"></div>
    </div>`;
}

/* ── Dropdown menu ── */
export function createDropdown(trigger, items) {
  let dropdown = null;
  trigger.onclick = (e) => {
    e.stopPropagation();
    if (dropdown) { dropdown.remove(); dropdown = null; return; }
    dropdown = document.createElement('div');
    dropdown.className = 'dropdown-menu animate-fade-in-scale';
    dropdown.style.cssText = `
      position:absolute;right:0;top:100%;margin-top:4px;
      background:var(--bg-card);border:1px solid var(--border-strong);
      border-radius:var(--radius-md);overflow:hidden;
      box-shadow:var(--shadow-lg);z-index:100;min-width:160px;
    `;
    items.forEach(item => {
      const el = document.createElement('div');
      el.style.cssText = `padding:10px 14px;cursor:pointer;font-size:0.88rem;font-weight:500;
        color:${item.danger ? 'var(--danger)' : 'var(--text-primary)'};
        display:flex;align-items:center;gap:8px;transition:background 0.15s`;
      el.innerHTML = `${item.icon || ''}<span>${item.label}</span>`;
      el.onmouseenter = () => el.style.background = 'var(--bg-hover)';
      el.onmouseleave = () => el.style.background = '';
      el.onclick = (e) => { e.stopPropagation(); item.action(); dropdown.remove(); dropdown = null; };
      dropdown.appendChild(el);
    });
    trigger.style.position = 'relative';
    trigger.appendChild(dropdown);
    const close = () => { dropdown?.remove(); dropdown = null; document.removeEventListener('click', close); };
    setTimeout(() => document.addEventListener('click', close), 50);
  };
}

/* ── Audio Effects (SFX) ── */
export function playSFX(type) {
  const audio = document.getElementById(`sfx-${type}`);
  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(e => console.warn('SFX autoplay prevented:', e));
  }
}
window.playSFX = playSFX;
