// =====================================================
// ZAMORA MSG — Settings Module
// =====================================================

import { db }             from './firebase-config.js';
import { getCurrentUser, logout, changePassword, deleteAccount } from './auth.js';
import {
  doc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { showToast, confirmDialog, setButtonLoading } from './ui.js';
import { router } from './router.js';

/* ── Init Settings ── */
export async function initSettings() {
  const user = getCurrentUser();
  if (!user) return;

  // Fill profile card
  const snap = await getDoc(doc(db, 'users', user.uid));
  const u    = snap.data() || {};

  const nameEl   = document.getElementById('settings-profile-name');
  const emailEl  = document.getElementById('settings-profile-email');
  const handleEl = document.getElementById('settings-profile-handle');
  const avatarEl = document.getElementById('settings-avatar');

  if (nameEl)   nameEl.textContent   = u.displayName || user.displayName || 'Usuario';
  if (emailEl)  emailEl.textContent  = user.email || '';
  if (handleEl) handleEl.textContent = '@' + (u.username || '');
  if (avatarEl && u.photoURL) { avatarEl.src = u.photoURL; avatarEl.style.display = 'block'; }

  // Navigation
  document.getElementById('settings-go-profile')?.addEventListener('click', () => router.navigate('profile'));
  document.getElementById('settings-go-edit')    ?.addEventListener('click', () => { router.navigate('profile'); setTimeout(() => { const { openModal } = require('./ui.js'); }, 300); });

  // Logout
  document.getElementById('settings-logout-btn')?.addEventListener('click', () => {
    confirmDialog(
      'Se cerrará tu sesión en este dispositivo.',
      async () => {
        try {
          await logout();
          showToast('Sesión cerrada. ¡Hasta pronto! 👋', 'info');
        } catch(e) { showToast('Error al cerrar sesión', 'error'); }
      },
      { title: '¿Cerrar sesión?', confirmText: 'Cerrar sesión', cancelText: 'Cancelar', danger: false }
    );
  });

  // Change password
  document.getElementById('change-password-form')?.addEventListener('submit', handleChangePassword);

  // Toggle password strength
  document.getElementById('new-password-input')?.addEventListener('input', (e) => {
    updatePassStrength(e.target.value);
  });

  // Privacy toggles
  setupPrivacyToggles(u);

  // Delete account
  document.getElementById('settings-delete-account-btn')?.addEventListener('click', () => {
    confirmDialog(
      'Esta acción es irreversible. Se eliminarán todos tus datos permanentemente.',
      () => showDeleteAccountModal(),
      { title: '⚠️ Eliminar cuenta', confirmText: 'Continuar', danger: true }
    );
  });

  document.getElementById('confirm-delete-account-btn')?.addEventListener('click', handleDeleteAccount);
}

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
      'auth/wrong-password':       'Contraseña actual incorrecta',
      'auth/requires-recent-login':'Vuelve a iniciar sesión e intenta de nuevo',
      'auth/weak-password':        'La nueva contraseña es demasiado débil'
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

function setupPrivacyToggles(userData) {
  const toggles = document.querySelectorAll('.settings-privacy-toggle');
  toggles.forEach(toggle => {
    const key = toggle.dataset.key;
    const val = userData.privacy?.[key] ?? true;
    toggle.classList.toggle('on', val);
    toggle.addEventListener('click', async () => {
      const newVal = !toggle.classList.contains('on');
      toggle.classList.toggle('on', newVal);
      const user = getCurrentUser();
      if (user) {
        try {
          await updateDoc(doc(db,'users',user.uid), { [`privacy.${key}`]: newVal });
        } catch(e) {}
      }
    });
  });
}

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
      'auth/wrong-password':       'Contraseña incorrecta',
      'auth/requires-recent-login':'Vuelve a iniciar sesión primero'
    };
    showToast(msgs[err.code] || 'Error al eliminar cuenta', 'error');
    setButtonLoading(btn, false, '⛔ Eliminar cuenta permanentemente');
  }
}
