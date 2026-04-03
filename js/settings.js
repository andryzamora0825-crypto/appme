// =====================================================
// ZAMORA MSG — Settings Module (v2)
// =====================================================

import { db }             from './firebase-config.js';
import { getCurrentUser, logout, changePassword, deleteAccount } from './auth.js';
import {
  doc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { showToast, confirmDialog, setButtonLoading } from './ui.js';
import { router } from './router.js';
import { formatDate } from './utils.js';

const PREFS_KEY = 'zamora_prefs';

function getPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; }
  catch { return {}; }
}
function savePrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

/* ── Apply stored preferences on load ── */
export function applyStoredPrefs() {
  const prefs = getPrefs();

  // Font size
  if (prefs.fontSize) {
    document.documentElement.style.fontSize = prefs.fontSize + '%';
  }

  // High contrast
  if (prefs.highContrast) document.body.classList.add('high-contrast');

  // Reduced neon
  if (prefs.reducedNeon) document.body.classList.add('reduced-neon');

  // Accent color
  if (prefs.accentColor) applyAccentColor(prefs.accentColor);
}

/* ── Init Settings ── */
export async function initSettings() {
  const user = getCurrentUser();
  if (!user) return;

  const snap = await getDoc(doc(db, 'users', user.uid));
  const u    = snap.data() || {};

  // Fill profile card & account info
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('settings-profile-name',   u.displayName || user.displayName || 'Usuario');
  setText('settings-profile-email',  user.email || '');
  setText('settings-profile-handle', '@' + (u.username || ''));
  setText('info-email',    user.email || '—');
  setText('info-username', '@' + (u.username || '—'));
  setText('info-joined',   u.createdAt ? formatDate(u.createdAt) : 'Recientemente');

  const avatarEl = document.getElementById('settings-avatar');
  const initEl   = document.getElementById('settings-initial');
  if (u.photoURL && avatarEl) {
    avatarEl.src = u.photoURL;
    avatarEl.style.display = 'block';
    if (initEl) initEl.style.display = 'none';
  } else if (initEl) {
    initEl.textContent = (u.displayName || user.email || '?')[0].toUpperCase();
  }

  // Tabs
  setupTabs();

  // Navigation
  document.getElementById('settings-go-profile')?.addEventListener('click', () => router.navigate('profile'));
  document.getElementById('settings-go-edit')?.addEventListener('click', () => {
    router.navigate('profile');
    setTimeout(() => document.getElementById('edit-profile-modal')?.classList.remove('hidden'), 400);
  });

  // Logout
  document.getElementById('settings-logout-btn')?.addEventListener('click', () => {
    confirmDialog(
      'Se cerrará tu sesión en este dispositivo.',
      async () => {
        try { await logout(); showToast('Sesión cerrada. ¡Hasta pronto! 👋', 'info'); }
        catch(e) { showToast('Error al cerrar sesión', 'error'); }
      },
      { title: '¿Cerrar sesión?', confirmText: 'Cerrar sesión', cancelText: 'Cancelar', danger: false }
    );
  });

  // Change password
  document.getElementById('change-password-form')?.addEventListener('submit', handleChangePassword);
  document.getElementById('new-password-input')?.addEventListener('input', (e) => updatePassStrength(e.target.value));

  // Privacy toggles
  setupPrivacyToggles(u);

  // Pref toggles
  setupPrefToggles();

  // Theme picker
  setupThemePicker();

  // Accent picker
  setupAccentPicker();

  // Font size
  setupFontSize();

  // Notification button
  setupNotifications();

  // Clear cache
  document.getElementById('settings-clear-cache-btn')?.addEventListener('click', () => {
    confirmDialog(
      'Se borrarán los datos temporales locales. No afecta tu cuenta.',
      () => {
        const prefs = getPrefs();
        localStorage.clear();
        // Restore prefs after clear so theme/accent remain
        savePrefs(prefs);
        showToast('Caché limpiada ✅', 'success');
      },
      { title: '🗑️ Limpiar caché', confirmText: 'Limpiar', danger: false }
    );
  });

  // Reset preferences
  document.getElementById('settings-reset-prefs-btn')?.addEventListener('click', () => {
    confirmDialog(
      'Se restablecerán todas las preferencias de apariencia y sonido.',
      () => {
        localStorage.removeItem(PREFS_KEY);
        document.documentElement.style.fontSize = '';
        document.body.classList.remove('high-contrast', 'reduced-neon');
        applyAccentColor('#4ADE80');
        showToast('Preferencias restablecidas 🔄', 'info');
        initSettings(); // re-render
      },
      { title: '🔄 Restablecer preferencias', confirmText: 'Restablecer', danger: false }
    );
  });

  // Delete account
  document.getElementById('settings-delete-account-btn')?.addEventListener('click', () => {
    confirmDialog(
      'Esta acción es irreversible. Se eliminarán todos tus datos permanentemente.',
      () => document.getElementById('delete-account-modal')?.classList.remove('hidden'),
      { title: '⚠️ Eliminar cuenta', confirmText: 'Continuar', danger: true }
    );
  });

  document.getElementById('confirm-delete-account-btn')?.addEventListener('click', handleDeleteAccount);
}

/* ── Tabs ── */
function setupTabs() {
  const tabs   = document.querySelectorAll('.settings-tab');
  const panels = document.querySelectorAll('.settings-section-panel');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t   => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('settings-panel-' + tab.dataset.section)?.classList.add('active');
    });
  });
}

/* ── Theme Picker ── */
const THEMES = {
  dark:    { '--bg-main': '#020402', '--bg-card': 'rgba(8,13,8,0.65)', '--bg-surface': 'rgba(15,26,15,0.7)' },
  darker:  { '--bg-main': '#000000', '--bg-card': 'rgba(5,5,5,0.8)',   '--bg-surface': 'rgba(10,10,10,0.9)' },
  forest:  { '--bg-main': '#0a1a0a', '--bg-card': 'rgba(12,28,12,0.7)','--bg-surface': 'rgba(18,40,18,0.8)' },
  ocean:   { '--bg-main': '#020814', '--bg-card': 'rgba(8,16,30,0.65)','--bg-surface': 'rgba(12,24,46,0.7)' },
  sunset:  { '--bg-main': '#140208', '--bg-card': 'rgba(25,8,15,0.7)', '--bg-surface': 'rgba(35,10,20,0.8)' },
};

function setupThemePicker() {
  const prefs = getPrefs();
  const current = prefs.theme || 'dark';
  document.querySelectorAll('.theme-option').forEach(opt => {
    if (opt.dataset.theme === current) opt.classList.add('active');
    opt.addEventListener('click', () => {
      document.querySelectorAll('.theme-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      const theme = opt.dataset.theme;
      applyTheme(theme);
      const prefs = getPrefs();
      prefs.theme = theme;
      savePrefs(prefs);
      showToast('Tema aplicado ✅', 'success');
    });
  });
  applyTheme(current);
}

function applyTheme(theme) {
  const vars = THEMES[theme];
  if (!vars) return;
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
}

/* ── Accent Picker ── */
function setupAccentPicker() {
  const prefs = getPrefs();
  const current = prefs.accentColor || '#4ADE80';
  document.querySelectorAll('.accent-swatch').forEach(sw => {
    if (sw.dataset.accent === current) sw.classList.add('active');
    sw.addEventListener('click', () => {
      document.querySelectorAll('.accent-swatch').forEach(s => s.classList.remove('active'));
      sw.classList.add('active');
      const color = sw.dataset.accent;
      applyAccentColor(color);
      const prefs = getPrefs();
      prefs.accentColor = color;
      savePrefs(prefs);
      showToast('Color de acento aplicado ✅', 'success');
    });
  });
}

function applyAccentColor(hex) {
  const r = document.documentElement;
  r.style.setProperty('--primary', hex);
  // Derive dark version (rough ~20% darker)
  r.style.setProperty('--primary-glow', hex + '66');
  r.style.setProperty('--primary-glow2', hex + '26');
  r.style.setProperty('--border', hex + '26');
  r.style.setProperty('--border-strong', hex + '59');
  r.style.setProperty('--gradient', `linear-gradient(135deg, ${hex}, ${hex}bb)`);
}

/* ── Font Size ── */
function setupFontSize() {
  const prefs = getPrefs();
  const slider = document.getElementById('settings-font-size');
  const display = document.getElementById('font-size-display');
  if (!slider) return;
  const val = prefs.fontSize || 100;
  slider.value = val;
  if (display) display.textContent = val + '%';
  slider.addEventListener('input', (e) => {
    const size = parseInt(e.target.value);
    if (display) display.textContent = size + '%';
    document.documentElement.style.fontSize = size + '%';
    const prefs = getPrefs();
    prefs.fontSize = size;
    savePrefs(prefs);
  });
}

/* ── Pref Toggles (local prefs) ── */
function setupPrefToggles() {
  const prefs = getPrefs();
  document.querySelectorAll('.settings-pref-toggle').forEach(toggle => {
    const key = toggle.dataset.key;
    const val = prefs[key] !== undefined ? prefs[key] : toggle.classList.contains('on');
    toggle.classList.toggle('on', val);

    toggle.addEventListener('click', () => {
      const newVal = !toggle.classList.contains('on');
      toggle.classList.toggle('on', newVal);
      const p = getPrefs();
      p[key] = newVal;
      savePrefs(p);

      // Apply side effects
      if (key === 'highContrast') document.body.classList.toggle('high-contrast', newVal);
      if (key === 'reducedNeon')  document.body.classList.toggle('reduced-neon', newVal);
      if (key === 'sfx')          window._sfxEnabled = newVal;
      showToast(newVal ? 'Activado ✅' : 'Desactivado', 'info', 1200);
    });
  });
}

/* ── Notifications ── */
function setupNotifications() {
  const btn = document.getElementById('notif-enable-btn');
  if ('Notification' in window && Notification.permission === 'default' && btn) {
    btn.style.display = 'flex';
    btn.addEventListener('click', async () => {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        showToast('Notificaciones activadas 🔔', 'success');
        btn.style.display = 'none';
      } else {
        showToast('Permiso denegado', 'warning');
      }
    });
  }
}

/* ── Privacy Toggles (Firestore) ── */
function setupPrivacyToggles(userData) {
  document.querySelectorAll('.settings-privacy-toggle').forEach(toggle => {
    const key = toggle.dataset.key;
    const val = userData.privacy?.[key] ?? toggle.classList.contains('on');
    toggle.classList.toggle('on', val);
    toggle.addEventListener('click', async () => {
      const newVal = !toggle.classList.contains('on');
      toggle.classList.toggle('on', newVal);
      const user = getCurrentUser();
      if (user) {
        try {
          await updateDoc(doc(db, 'users', user.uid), { [`privacy.${key}`]: newVal });
          showToast(newVal ? 'Activado ✅' : 'Desactivado', 'info', 1200);
        } catch(e) { showToast('Error al guardar', 'error'); }
      }
    });
  });
}

/* ── Change Password ── */
async function handleChangePassword(e) {
  e.preventDefault();
  const currentPwd = document.getElementById('current-password-input')?.value;
  const newPwd     = document.getElementById('new-password-input')?.value;
  const confirmPwd = document.getElementById('confirm-password-input')?.value;
  const btn        = e.submitter || document.getElementById('change-password-btn');

  if (!currentPwd || !newPwd || !confirmPwd) { showToast('Completa todos los campos', 'warning'); return; }
  if (newPwd !== confirmPwd) { showToast('Las contraseñas no coinciden', 'error'); return; }
  if (newPwd.length < 6)    { showToast('Mínimo 6 caracteres', 'warning'); return; }

  setButtonLoading(btn, true);
  try {
    await changePassword(currentPwd, newPwd);
    showToast('Contraseña actualizada ✅', 'success');
    e.target.reset();
    document.getElementById('change-password-modal')?.classList.add('hidden');
  } catch(err) {
    const msgs = {
      'auth/wrong-password':        'Contraseña actual incorrecta',
      'auth/requires-recent-login': 'Vuelve a iniciar sesión e intenta de nuevo',
      'auth/weak-password':         'La nueva contraseña es demasiado débil'
    };
    showToast(msgs[err.code] || 'Error al cambiar contraseña', 'error');
  } finally {
    setButtonLoading(btn, false, '🔒 Cambiar Contraseña');
  }
}

function updatePassStrength(pwd) {
  const bars  = document.querySelectorAll('#settings-strength .strength-bar');
  const label = document.getElementById('settings-strength-label');
  if (!bars.length) return;
  let score = 0;
  if (pwd.length >= 6)  score++;
  if (pwd.length >= 10) score++;
  if (/[A-Z]/.test(pwd) && /[0-9]/.test(pwd)) score++;
  const levels = ['','weak','medium','strong'];
  const labels = ['','Débil','Media','Fuerte'];
  bars.forEach((b, i) => { b.className = 'strength-bar ' + (i < score ? levels[score] : ''); });
  if (label) { label.textContent = labels[score] || ''; label.className = 'strength-label ' + (levels[score] || ''); }
}

/* ── Delete Account ── */
function showDeleteAccountModal() {
  document.getElementById('delete-account-modal')?.classList.remove('hidden');
}

async function handleDeleteAccount() {
  const password = document.getElementById('delete-confirm-password')?.value;
  const confirm  = document.getElementById('delete-confirm-text')?.value;
  if (confirm !== 'ELIMINAR') { showToast('Escribe ELIMINAR para confirmar', 'warning'); return; }
  if (!password)              { showToast('Ingresa tu contraseña', 'warning'); return; }
  const btn = document.getElementById('confirm-delete-account-btn');
  setButtonLoading(btn, true);
  try {
    await deleteAccount(password);
    showToast('Cuenta eliminada. ¡Hasta pronto!', 'info');
  } catch(err) {
    const msgs = {
      'auth/wrong-password':        'Contraseña incorrecta',
      'auth/requires-recent-login': 'Vuelve a iniciar sesión primero'
    };
    showToast(msgs[err.code] || 'Error al eliminar cuenta', 'error');
    setButtonLoading(btn, false, '⛔ Eliminar cuenta permanentemente');
  }
}
