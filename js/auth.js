// =====================================================
// ZAMORA MSG — Auth Module
// =====================================================

import { auth, db, storage } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";
import { showToast, setButtonLoading } from './ui.js';
import { compressImage, validateImageFile, readFileAsDataURL } from './utils.js';
import { router } from './router.js';

const googleProvider = new GoogleAuthProvider();

/* ── Auth State onChange ── */
let authCallbacks = [];
export function onAuthChange(cb) { authCallbacks.push(cb); }

onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Update last seen
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        lastSeen: serverTimestamp(), online: true
      });
    } catch (e) {}
  }
  authCallbacks.forEach(cb => cb(user));
});

export function getCurrentUser() { return auth.currentUser; }

/* ── Create User Document ── */
async function createUserDoc(user, extra = {}) {
  const userRef = doc(db, 'users', user.uid);
  const snap    = await getDoc(userRef);
  if (!snap.exists()) {
    const username = (user.displayName || user.email.split('@')[0])
      .toLowerCase().replace(/\s+/g,'').replace(/[^a-z0-9_]/g,'').substring(0, 20);
    await setDoc(userRef, {
      uid:          user.uid,
      displayName:  user.displayName || extra.displayName || 'Usuario',
      email:        user.email,
      photoURL:     user.photoURL || '',
      coverURL:     '',
      username:     username + '_' + Math.floor(Math.random()*1000),
      bio:          '',
      location:     '',
      website:      '',
      createdAt:    serverTimestamp(),
      lastSeen:     serverTimestamp(),
      online:       true,
      noteText:     '',
      noteEmoji:    '',
      noteUpdatedAt: null,
      postsCount:   0,
      followersCount: 0,
      followingCount: 0,
      ...extra
    });
  }
}

/* ── Register with Email ── */
export async function registerWithEmail(name, email, password, avatarFile = null) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  let photoURL = '';
  if (avatarFile) {
    const compressed = await compressImage(avatarFile, 400, 0.8);
    const storageRef  = ref(storage, `avatars/${cred.user.uid}`);
    await uploadBytes(storageRef, compressed);
    photoURL = await getDownloadURL(storageRef);
  }
  await updateProfile(cred.user, { displayName: name, photoURL });
  await createUserDoc(cred.user, { displayName: name, photoURL });
  return cred.user;
}

/* ── Login with Email ── */
export async function loginWithEmail(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

/* ── Google Sign In ── */
export async function loginWithGoogle() {
  const cred = await signInWithPopup(auth, googleProvider);
  await createUserDoc(cred.user);
  return cred.user;
}

/* ── Logout ── */
export async function logout() {
  const uid = auth.currentUser?.uid;
  if (uid) {
    try { await updateDoc(doc(db, 'users', uid), { online: false, lastSeen: serverTimestamp() }); } catch {}
  }
  await signOut(auth);
}

/* ── Password Reset ── */
export async function sendPasswordReset(email) {
  await sendPasswordResetEmail(auth, email);
}

/* ── Update Password ── */
export async function changePassword(currentPassword, newPassword) {
  const user       = auth.currentUser;
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

/* ── Delete Account ── */
export async function deleteAccount(password) {
  const user       = auth.currentUser;
  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);
  await deleteUser(user);
}

/* ── Upload Avatar ── */
export async function uploadAvatar(file) {
  const user = auth.currentUser;
  if (!user) throw new Error('No autenticado');
  const err  = validateImageFile(file);
  if (err) throw new Error(err);
  const compressed = await compressImage(file, 400, 0.85);
  const storageRef = ref(storage, `avatars/${user.uid}`);
  await uploadBytes(storageRef, compressed);
  const url = await getDownloadURL(storageRef);
  await updateProfile(user, { photoURL: url });
  await updateDoc(doc(db, 'users', user.uid), { photoURL: url });
  return url;
}

/* ── Upload Cover ── */
export async function uploadCover(file) {
  const user = auth.currentUser;
  if (!user) throw new Error('No autenticado');
  const err  = validateImageFile(file, 15);
  if (err) throw new Error(err);
  const compressed = await compressImage(file, 1200, 0.85);
  const storageRef = ref(storage, `covers/${user.uid}`);
  await uploadBytes(storageRef, compressed);
  const url = await getDownloadURL(storageRef);
  await updateDoc(doc(db, 'users', user.uid), { coverURL: url });
  return url;
}

/* ─────────────────────────────────────────────
   Auth UI
   ──────────────────────────────────────────── */
let avatarFileForRegister = null;

export function initAuthUI() {
  const loginTab    = document.getElementById('login-tab');
  const regTab      = document.getElementById('register-tab');
  const loginForm   = document.getElementById('login-form');
  const regForm     = document.getElementById('register-form');
  const forgotPanel = document.getElementById('forgot-panel');

  // Tab switching
  const switchToLogin = () => {
    loginTab.classList.add('active'); regTab.classList.remove('active');
    loginForm.classList.remove('hidden'); regForm.classList.add('hidden');
    forgotPanel.classList.remove('active'); clearErrors();
  };
  const switchToRegister = () => {
    regTab.classList.add('active'); loginTab.classList.remove('active');
    regForm.classList.remove('hidden'); loginForm.classList.add('hidden');
    forgotPanel.classList.remove('active'); clearErrors();
  };
  loginTab?.addEventListener('click', switchToLogin);
  regTab  ?.addEventListener('click', switchToRegister);

  // Password toggle
  document.querySelectorAll('.password-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.closest('.password-wrap').querySelector('input');
      input.type  = input.type === 'password' ? 'text' : 'password';
      btn.innerHTML = input.type === 'password' ? eyeIcon() : eyeOffIcon();
    });
  });

  // Avatar upload in register
  const avatarUpload  = document.getElementById('register-avatar-input');
  const avatarPreview = document.getElementById('register-avatar-preview');
  avatarUpload?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { showToast(err, 'error'); return; }
    avatarFileForRegister = file;
    const url = await readFileAsDataURL(file);
    avatarPreview.src = url;
    avatarPreview.style.objectFit = 'cover';
  });

  // Login form
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn      = document.getElementById('login-btn');
    clearErrors();
    if (!email || !password) { showError('Completa todos los campos.'); return; }
    setButtonLoading(btn, true);
    try {
      await loginWithEmail(email, password);
      showToast('¡Bienvenido de vuelta! 👋', 'success');
    } catch (err) {
      setButtonLoading(btn, false, `<span>Iniciar Sesión →</span>`);
      showError(translateFirebaseError(err.code));
    }
  });

  // Register form
  regForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name     = document.getElementById('reg-name').value.trim();
    const email    = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm  = document.getElementById('reg-confirm').value;
    const btn      = document.getElementById('register-btn');
    clearErrors();
    if (!name || !email || !password) { showError('Completa todos los campos.'); return; }
    if (password !== confirm) { showError('Las contraseñas no coinciden.'); return; }
    if (password.length < 6)  { showError('La contraseña debe tener al menos 6 caracteres.'); return; }
    setButtonLoading(btn, true);
    try {
      await registerWithEmail(name, email, password, avatarFileForRegister);
      showToast('¡Cuenta creada! Bienvenido a Zamora MSG 🎉', 'success');
    } catch (err) {
      setButtonLoading(btn, false, `<span>Crear Cuenta →</span>`);
      showError(translateFirebaseError(err.code));
    }
  });

  // Google
  document.getElementById('google-login-btn')  ?.addEventListener('click', handleGoogle);
  document.getElementById('google-register-btn')?.addEventListener('click', handleGoogle);

  async function handleGoogle() {
    clearErrors();
    try {
      await loginWithGoogle();
      showToast('¡Bienvenido! 👋', 'success');
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') showError(translateFirebaseError(err.code));
    }
  }

  // Forgot password
  document.getElementById('forgot-link')?.addEventListener('click', () => {
    loginForm.classList.add('hidden');
    forgotPanel.classList.add('active');
  });
  document.getElementById('forgot-back')?.addEventListener('click', switchToLogin);
  document.getElementById('forgot-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();
    const btn   = document.getElementById('forgot-btn');
    if (!email) return;
    setButtonLoading(btn, true);
    try {
      await sendPasswordReset(email);
      showToast('Correo enviado. Revisa tu bandeja de entrada 📧', 'success');
      document.getElementById('forgot-success').classList.remove('hidden');
    } catch (err) {
      showError(translateFirebaseError(err.code));
    } finally {
      setButtonLoading(btn, false, '📧 Enviar correo');
    }
  });

  // Real-time validation
  document.getElementById('reg-password')?.addEventListener('input', (e) => {
    updatePasswordStrength(e.target.value);
  });
}

function showError(msg) {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}
function clearErrors() {
  const el = document.getElementById('auth-error');
  if (el) el.classList.add('hidden');
  const suc = document.getElementById('auth-success');
  if (suc) suc.classList.add('hidden');
}

function updatePasswordStrength(pwd) {
  const bars  = document.querySelectorAll('#reg-strength .strength-bar');
  const label = document.getElementById('reg-strength-label');
  if (!bars.length) return;
  let score = 0;
  if (pwd.length >= 6)  score++;
  if (pwd.length >= 10) score++;
  if (/[A-Z]/.test(pwd) && /[0-9]/.test(pwd)) score++;
  const levels = ['','weak','medium','strong'];
  const labels = ['','Débil','Media','Fuerte'];
  bars.forEach((b, i) => {
    b.className = 'strength-bar ' + (i < score ? levels[score] : '');
  });
  if (label) { label.textContent = labels[score] || ''; label.className = 'strength-label ' + (levels[score] || ''); }
}

function translateFirebaseError(code) {
  const m = {
    'auth/email-already-in-use':    'Este correo ya está registrado.',
    'auth/invalid-email':           'El correo no es válido.',
    'auth/weak-password':           'La contraseña es demasiado débil.',
    'auth/user-not-found':          'No existe una cuenta con este correo.',
    'auth/wrong-password':          'Contraseña incorrecta.',
    'auth/invalid-credential':      'Credenciales incorrectas. Verifica tu correo y contraseña.',
    'auth/too-many-requests':       'Demasiados intentos. Intenta más tarde.',
    'auth/network-request-failed':  'Error de red. Verifica tu conexión.',
    'auth/popup-blocked':           'El popup fue bloqueado. Permite popups para este sitio.',
    'auth/requires-recent-login':   'Debes iniciar sesión de nuevo.',
  };
  return m[code] || `Error: ${code}`;
}

function eyeIcon()    { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`; }
function eyeOffIcon() { return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`; }
