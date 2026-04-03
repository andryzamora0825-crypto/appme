// =====================================================
// ZAMORA MSG — Profile Module
// =====================================================

import { db, storage }    from './firebase-config.js';
import { getCurrentUser, uploadAvatar, uploadCover } from './auth.js';
import {
  doc, getDoc, updateDoc, query, collection,
  where, orderBy, limit, getDocs, serverTimestamp,
  arrayUnion, arrayRemove, increment
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { showToast, openModal, closeModal, getAvatarHTML, confirmDialog } from './ui.js';
import { validateImageFile, timeAgo } from './utils.js';
import { loadStickerGallery } from './stickers.js';

let currentProfileUid = null;
let activeTab         = 'posts';

/* ── Init Profile ── */
export async function initProfile(params = {}) {
  const user         = getCurrentUser();
  const uid          = params.uid || user?.uid;
  if (!uid) return;
  currentProfileUid  = uid;
  const isOwn        = uid === user?.uid;

  await renderProfile(uid, isOwn);
  setupProfileTabs(uid, isOwn);
  if (isOwn) setupEditProfile();
}

/* ── Render Profile Header ── */
async function renderProfile(uid, isOwn) {
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) { showToast('Usuario no encontrado', 'error'); return; }
  const u = userSnap.data();

  // Cover
  const coverEl = document.getElementById('profile-cover');
  const coverPlaceholder = document.getElementById('profile-cover-placeholder');
  if (u.coverURL) {
    coverEl?.setAttribute('src', u.coverURL);
    coverEl?.classList.remove('hidden');
    coverPlaceholder?.classList.add('hidden');
  } else {
    coverEl?.classList.add('hidden');
    coverPlaceholder?.classList.remove('hidden');
  }

  // Avatar
  const avatarEl = document.getElementById('profile-avatar');
  if (avatarEl) {
    if (u.photoURL) { avatarEl.src = u.photoURL; avatarEl.style.display = 'block'; }
    else { avatarEl.style.display = 'none'; }
  }
  const avatarInitial = document.getElementById('profile-avatar-initial');
  if (avatarInitial) avatarInitial.textContent = (u.displayName || '?')[0].toUpperCase();

  // Info
  setText('profile-name',     u.displayName || 'Usuario');
  setText('profile-username', '@' + (u.username || ''));
  setText('profile-bio',      u.bio || '');
  setText('profile-posts-count',     u.postsCount     || 0);
  setText('profile-followers-count', u.followersCount || 0);
  setText('profile-following-count', u.followingCount || 0);
  
  // Meta Info
  const metaContainer = document.getElementById('profile-meta-container');
  if (metaContainer) {
    let hasMeta = false;
    if (u.location) {
      document.getElementById('meta-location').style.display = 'flex';
      setText('profile-location', u.location);
      hasMeta = true;
    } else { document.getElementById('meta-location').style.display = 'none'; }
    
    if (u.website) {
      const webEl = document.getElementById('profile-website');
      const webItem = document.getElementById('meta-website');
      webItem.style.display = 'flex';
      webEl.href = u.website.startsWith('http') ? u.website : 'https://' + u.website;
      webEl.textContent = u.website.replace(/^https?:\/\//, '');
      hasMeta = true;
    } else { document.getElementById('meta-website').style.display = 'none'; }
    
    // Join Date
    const joinedStr = u.createdAt ? timeAgo(u.createdAt) : 'recientemente';
    setText('profile-joined', 'Se unió ' + joinedStr);
    hasMeta = true; // Always show joined
    
    metaContainer.style.display = hasMeta ? 'flex' : 'none';
  }

  // Note
  const noteWrap = document.getElementById('profile-note-wrap');
  if (noteWrap) {
    if (u.noteText) {
      noteWrap.classList.remove('hidden');
      setText('profile-note-emoji', u.noteEmoji || '💬');
      setText('profile-note-text',  u.noteText);
    } else if (isOwn) {
      noteWrap.classList.remove('hidden');
      setText('profile-note-text', 'Agrega una nota...');
    } else {
      noteWrap.classList.add('hidden');
    }
  }

  // Action buttons
  const actionsEl = document.getElementById('profile-actions');
  if (actionsEl) {
    if (isOwn) {
      actionsEl.innerHTML = `
        <button class="btn btn-secondary btn-sm" onclick="openModal('edit-profile-modal')">✏️ Editar perfil</button>
        <button class="btn btn-ghost btn-sm" onclick="window.goToSettings()">⚙️ Configuración</button>`;
    } else {
      const isFollowing = u.followers && u.followers.includes(user.uid);
      const followText = isFollowing ? '✔️ Siguiendo' : '➕ Seguir';
      const followClass = isFollowing ? 'btn-secondary' : 'btn-primary';
      
      actionsEl.innerHTML = `
        <button class="btn ${followClass} btn-sm" id="follow-btn-main" onclick="window.toggleFollowUser('${uid}', ${isFollowing})">${followText}</button>
        <button class="btn btn-secondary btn-sm" onclick="window.openChatWith('${uid}')">💬 Mensaje</button>`;
    }
  }

  // Cover edit
  const coverEdit = document.getElementById('profile-cover-edit-btn');
  if (coverEdit) coverEdit.style.display = isOwn ? '' : 'none';
  const avatarEdit = document.getElementById('profile-avatar-edit');
  if (avatarEdit) avatarEdit.style.display = isOwn ? '' : 'none';

  // Cover click
  if (isOwn) {
    coverEdit?.addEventListener('click', () => document.getElementById('cover-upload-input')?.click());
    const coverInput = document.getElementById('cover-upload-input');
    coverInput?.removeEventListener('change', handleCoverUpload);
    coverInput?.addEventListener('change', handleCoverUpload);

    avatarEdit?.addEventListener('click', () => document.getElementById('avatar-upload-input')?.click());
    const avInput = document.getElementById('avatar-upload-input');
    avInput?.removeEventListener('change', handleAvatarUpload);
    avInput?.addEventListener('change', handleAvatarUpload);
  }
}

async function handleCoverUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const err = validateImageFile(file, 15);
  if (err)  { showToast(err, 'error'); return; }
  showToast('Subiendo portada...', 'info', 2000);
  try {
    const url = await uploadCover(file);
    const coverEl = document.getElementById('profile-cover');
    if (coverEl) { coverEl.src = url; coverEl.classList.remove('hidden'); }
    showToast('Portada actualizada ✅', 'success');
  } catch(e) { showToast('Error al subir portada', 'error'); }
}

async function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const err = validateImageFile(file);
  if (err)  { showToast(err, 'error'); return; }
  showToast('Subiendo foto...', 'info', 2000);
  try {
    const url = await uploadAvatar(file);
    const avatarEl = document.getElementById('profile-avatar');
    if (avatarEl) { avatarEl.src = url; avatarEl.style.display = 'block'; }
    showToast('Foto de perfil actualizada ✅', 'success');
  } catch(e) { showToast('Error al subir foto', 'error'); }
}

/* ── Profile Tabs ── */
function setupProfileTabs(uid, isOwn) {
  const tabs = document.querySelectorAll('.profile-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      renderTabContent(uid, activeTab);
    });
  });
  renderTabContent(uid, 'posts');
}

async function renderTabContent(uid, tab) {
  const content = document.getElementById('profile-tab-content');
  if (!content) return;
  content.innerHTML = '<div class="flex-center" style="padding:40px"><div class="spinner"></div></div>';

  switch(tab) {
    case 'posts':    await renderPostsGrid(uid, content); break;
    case 'stickers': await renderStickersGallery(uid, content); break;
    case 'photos':   await renderPhotosGrid(uid, content); break;
    case 'about':    await renderAbout(uid, content); break;
  }
}

async function renderPostsGrid(uid, container) {
  const q    = query(collection(db,'posts'), where('authorId','==',uid), where('type','==','post'), orderBy('createdAt','desc'), limit(30));
  const snap = await getDocs(q);
  if (snap.empty) { container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📝</div><h3>Sin publicaciones</h3></div>`; return; }

  const posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  container.innerHTML = `<div class="posts-grid">${posts.map(p => {
    if (p.imageURL) return `
      <div class="post-grid-item" onclick="openImageLightbox('${p.imageURL}')">
        <img src="${p.imageURL}" alt="post">
        <div class="post-grid-overlay">
          <span class="post-grid-stat">❤️ ${p.likes?.length||0}</span>
          <span class="post-grid-stat">💬 ${p.commentsCount||0}</span>
        </div>
      </div>`;
    if (p.stickerURL) return `
      <div class="post-grid-item" onclick="openImageLightbox('${p.stickerURL}')">
        <img src="${p.stickerURL}" alt="sticker" style="object-fit:contain;padding:8px">
      </div>`;
    return `
      <div class="post-grid-item">
        <div class="post-grid-text">${p.content?.substring(0,80)||''}</div>
      </div>`;
  }).join('')}</div>`;
}

async function renderStickersGallery(uid, container) {
  const q    = query(collection(db,'stickers'), where('authorId','==',uid), orderBy('createdAt','desc'), limit(40));
  const snap = await getDocs(q);
  if (snap.empty) { container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎨</div><h3>Sin stickers creados</h3></div>`; return; }
  container.innerHTML = `<div class="stickers-gallery">${snap.docs.map(d => {
    const s = { id: d.id, ...d.data() };
    return `<div class="sticker-gallery-item" onclick="openImageLightbox('${s.imageURL}')">
      <img src="${s.imageURL}" alt="${s.name}">
      <div class="sticker-name">${s.name}</div>
      <div class="sticker-uses">×${s.usageCount||0}</div>
    </div>`;
  }).join('')}</div>`;
}

async function renderPhotosGrid(uid, container) {
  const q    = query(collection(db,'posts'), where('authorId','==',uid), where('type','==','post'), orderBy('createdAt','desc'), limit(50));
  const snap = await getDocs(q);
  const withImages = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.imageURL);
  if (!withImages.length) { container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🖼️</div><h3>Sin fotos</h3></div>`; return; }
  container.innerHTML = `<div class="posts-grid">${withImages.map(p => `
    <div class="post-grid-item" onclick="openImageLightbox('${p.imageURL}')">
      <img src="${p.imageURL}" alt="foto">
    </div>`).join('')}</div>`;
}

async function renderAbout(uid, container) {
  const snap = await getDoc(doc(db,'users',uid));
  const u    = snap.data() || {};
  container.innerHTML = `
    <div class="about-section">
      ${u.bio ? `<div class="about-card"><div class="about-card-title">Bio</div><p style="font-size:0.92rem;color:var(--text-secondary);line-height:1.6">${u.bio}</p></div>` : ''}
      <div class="about-card">
        <div class="about-card-title">Info</div>
        <div class="about-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg><span>@${u.username || 'sin-usuario'}</span></div>
        ${u.location ? `<div class="about-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span>${u.location}</span></div>` : ''}
        ${u.website ? `<div class="about-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><a href="${u.website}" target="_blank">${u.website}</a></div>` : ''}
        <div class="about-row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span>Se unió ${u.createdAt ? timeAgo(u.createdAt) : 'recientemente'}</span></div>
      </div>
    </div>`;
}

/* ── Edit Profile Modal ── */
function setupEditProfile() {
  const saveBtn = document.getElementById('save-profile-btn');
  saveBtn?.addEventListener('click', saveProfile);

  // Pre-fill form
  const user = getCurrentUser();
  if (!user) return;
  getDoc(doc(db,'users',user.uid)).then(snap => {
    const u = snap.data() || {};
    setVal('edit-name',     u.displayName || '');
    setVal('edit-username', u.username    || '');
    setVal('edit-bio',      u.bio         || '');
    setVal('edit-location', u.location    || '');
    setVal('edit-website',  u.website     || '');
    const editAvatarPreview = document.getElementById('edit-avatar-preview');
    if (editAvatarPreview && u.photoURL) editAvatarPreview.src = u.photoURL;
  });

  // Avatar change in modal
  document.getElementById('edit-avatar-btn')?.addEventListener('click', () => {
    document.getElementById('edit-avatar-input')?.click();
  });
  document.getElementById('edit-avatar-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const url = await uploadAvatar(file);
      const prev = document.getElementById('edit-avatar-preview');
      if (prev) prev.src = url;
      showToast('Foto actualizada', 'success');
    } catch(e2) { showToast('Error al subir foto', 'error'); }
  });
}

async function saveProfile() {
  const user = getCurrentUser();
  if (!user) return;
  const btn     = document.getElementById('save-profile-btn');
  btn.disabled  = true; btn.textContent = 'Guardando...';
  const updates = {
    displayName: getVal('edit-name')     || user.displayName || '',
    username:    getVal('edit-username') || '',
    bio:         getVal('edit-bio')      || '',
    location:    getVal('edit-location') || '',
    website:     getVal('edit-website')  || ''
  };
  try {
    await updateDoc(doc(db,'users',user.uid), updates);
    closeModal('edit-profile-modal');
    showToast('Perfil actualizado ✅', 'success');
    await initProfile();
  } catch(e) {
    showToast('Error al guardar', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar cambios';
  }
}

/* ── Follow/Unfollow ── */
window.toggleFollowUser = async (targetUid, isCurrentlyFollowing) => {
  const user = getCurrentUser();
  if (!user) { showToast('Inicia sesión', 'info'); return; }
  
  const btn = document.getElementById('follow-btn-main');
  if (btn) btn.disabled = true;

  try {
    const targetRef = doc(db, 'users', targetUid);
    const myRef = doc(db, 'users', user.uid);
    
    if (isCurrentlyFollowing) {
      // Unfollow
      await updateDoc(targetRef, {
        followers: arrayRemove(user.uid),
        followersCount: increment(-1)
      });
      await updateDoc(myRef, {
        following: arrayRemove(targetUid),
        followingCount: increment(-1)
      });
      showToast('Has dejado de seguir a este usuario', 'info');
    } else {
      // Follow
      await updateDoc(targetRef, {
        followers: arrayUnion(user.uid),
        followersCount: increment(1)
      });
      await updateDoc(myRef, {
        following: arrayUnion(targetUid),
        followingCount: increment(1)
      });
      showToast('¡Ahora sigues a este usuario! 🎉', 'success');
      window.playSFX('like'); // Play sound effect
    }
    
    // Re-render profile headers to update numbers and button state
    await renderProfile(targetUid, false);
    
  } catch(e) {
    console.error(e);
    showToast('Error al actualizar seguimiento', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.goToSettings = () => import('./router.js').then(({ router }) => router.navigate('settings'));

/* ── Helpers ── */
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function setVal(id, val)  { const el = document.getElementById(id); if (el) el.value = val; }
function getVal(id)       { return document.getElementById(id)?.value?.trim() || ''; }
