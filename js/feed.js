// =====================================================
// ZAMORA MSG — Feed Module
// =====================================================

import { db, storage }      from './firebase-config.js';
import { getCurrentUser }   from './auth.js';
import {
  collection, addDoc, getDocs, query, orderBy,
  limit, startAfter, doc, updateDoc, arrayUnion,
  arrayRemove, getDoc, onSnapshot, serverTimestamp,
  increment, deleteDoc, where
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";
import {
  showToast, openModal, closeModal, getAvatarHTML,
  openImageLightbox, createDropdown
} from './ui.js';
import {
  timeAgo, formatPostContent, compressImage,
  validateImageFile, readFileAsDataURL, generateId
} from './utils.js';
import { router } from './router.js';

let lastDoc         = null;
let feedListener    = null;
let postImageFile   = null;
let feedInitialized = false;
let isLoadingMore   = false;

const PAGE_SIZE = 3;

/* ── Init Feed ── */
export function initFeed() {
  if (feedInitialized) { return; }
  feedInitialized = true;

  setupCreatePostModal();
  setupCreatePostBar();
  
  // Mostrar el feed inmediatamente mientras carga
  loadFeedWithListener();

  // Load more on scroll
  const mainContent = document.querySelector('.main-content');
  mainContent?.addEventListener('scroll', handleFeedScroll);
  
  // Cargar contenido secundario en background (sin bloquear)
  // Se cargarán cuando el usuario tenga espacio para verlas
  requestAnimationFrame(() => {
    setTimeout(() => loadStories(), 200);
    setTimeout(() => loadSuggestedUsers(), 800);
  });
}

function handleFeedScroll() {
  const el = document.querySelector('.main-content');
  if (!el || isLoadingMore) return;
  const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 300;
  if (nearBottom) loadMorePosts();
}

/* ── Feed Listener ── */
function loadFeedWithListener() {
  const container   = document.getElementById('feed-posts');
  if (!container) return;
  container.innerHTML = '';

  const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
  if (feedListener) feedListener();
  feedListener = onSnapshot(q, async (snap) => {
    if (snap.empty) {
      container.innerHTML = emptyFeedHTML();
      return;
    }
    lastDoc = snap.docs[snap.docs.length - 1];
    const posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const authorIds = [...new Set(posts.map(p => p.authorId))];
    const authorMap = {};
    const authorPromises = authorIds.map(id => getUserData(id).then(u => authorMap[id] = u));
    await Promise.all(authorPromises);
    const postsWithAuthors = posts.map(post => ({ post, author: authorMap[post.authorId] }));
    container.innerHTML = postsWithAuthors.map(({ post, author }) => renderPost(post, author)).join('');
    attachPostHandlers();
  });
}

async function loadMorePosts() {
  if (!lastDoc || isLoadingMore) return;
  isLoadingMore = true;
  const container = document.getElementById('feed-posts');
  const q = query(collection(db, 'posts'), orderBy('createdAt','desc'), startAfter(lastDoc), limit(PAGE_SIZE));
  const snap = await getDocs(q);
  if (!snap.empty) {
    lastDoc = snap.docs[snap.docs.length - 1];
    const posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const authorIds = [...new Set(posts.map(p => p.authorId))];
    const authorMap = {};
    const authorPromises = authorIds.map(id => getUserData(id).then(u => authorMap[id] = u));
    await Promise.all(authorPromises);
    const postsWithAuthors = posts.map(post => ({ post, author: authorMap[post.authorId] }));
    const frag = postsWithAuthors.map(({ post, author }) => renderPost(post, author)).join('');
    if (container) container.insertAdjacentHTML('beforeend', frag);
    attachPostHandlers();
  }
  isLoadingMore = false;
}

/* ── User Data Cache ── */
const userCache = {};
async function getUserData(uid) {
  if (userCache[uid]) return userCache[uid];
  const snap = await getDoc(doc(db, 'users', uid));
  userCache[uid] = snap.exists() ? snap.data() : { displayName: 'Usuario', photoURL: '', username: '' };
  return userCache[uid];
}

/* ── Render Post ── */
function renderPost(post, author) {
  const user     = getCurrentUser();
  const isLiked  = user && post.likes?.includes(user.uid);
  const isOwner  = user && post.authorId === user.uid;
  const likeCount = post.likes?.length || 0;

  const mediaHTML = post.imageURL ? `
    <div class="post-image-wrap" onclick="openImageLightbox('${post.imageURL}')">
      <img class="post-image" src="${post.imageURL}" alt="post image" loading="lazy">
    </div>` : '';

  const stickerHTML = post.stickerURL ? `
    <div class="post-sticker" onclick="openImageLightbox('${post.stickerURL}')">
      <img src="${post.stickerURL}" alt="sticker">
    </div>` : '';

  const viewOnceBadge = post.viewOnce ? `<span class="view-once-badge">👁️ Ver una sola vez</span>` : '';

  const menuItems = isOwner
    ? `<div class="post-menu-btn" data-post-id="${post.id}" id="menu-${post.id}">⋯</div>`
    : '';

  const noteHtml = author.noteText ? `<div class="feed-note-indicator" title="${author.noteText}">${author.noteEmoji || ''} ${author.noteText}</div>` : '';

  return `
  <article class="post-card" data-post-id="${post.id}">
    <div class="post-header">
      <div style="position:relative;cursor:pointer" onclick="window.viewProfile('${post.authorId}')">
        ${noteHtml}
        ${getAvatarHTML(author, 'md')}
      </div>
      <div style="cursor:pointer" onclick="window.viewProfile('${post.authorId}')">
        <div class="post-author-name">${author.displayName || 'Usuario'}</div>
        <div class="post-author-handle">@${author.username || ''} · ${timeAgo(post.createdAt)}</div>
      </div>
      ${menuItems}
    </div>
    ${viewOnceBadge}
    ${post.content ? `<div class="post-content">${formatPostContent(post.content)}</div>` : ''}
    ${mediaHTML}
    ${stickerHTML}
    <div class="post-actions">
      <div class="post-action like-btn ${isLiked ? 'liked' : ''}" data-post-id="${post.id}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <span>${likeCount > 0 ? likeCount : ''}</span>
      </div>
      <div class="post-action comment-btn" data-post-id="${post.id}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span>${post.commentsCount || ''}</span>
      </div>
      <div class="post-action share-btn" data-post-id="${post.id}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
      </div>
    </div>
    <div class="comments-section" id="comments-${post.id}">
      <div class="comment-input-row">
        ${getAvatarHTML(getCurrentUser(), 'sm')}
        <textarea class="comment-input" placeholder="Escribe un comentario..." rows="1" data-post-id="${post.id}"></textarea>
        <button class="comment-send-btn" data-post-id="${post.id}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      <div class="comments-list" id="comments-list-${post.id}"></div>
    </div>
  </article>`;
}

/* ── Attach Post Event Handlers ── */
function attachPostHandlers() {
  const user = getCurrentUser();

  // Like buttons
  document.querySelectorAll('.like-btn:not([data-bound])').forEach(btn => {
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      if (!user) { showToast('Inicia sesión para dar like', 'info'); return; }
      const postId  = btn.dataset.postId;
      const postRef = doc(db, 'posts', postId);
      const isLiked = btn.classList.contains('liked');
      btn.classList.toggle('liked', !isLiked);
      try {
        await updateDoc(postRef, {
          likes: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid)
        });
        if (!isLiked) window.playSFX('like'); // Play like SFX
      } catch(e) { btn.classList.toggle('liked', isLiked); }
    });
  });

  // Comment toggle
  document.querySelectorAll('.comment-btn:not([data-bound])').forEach(btn => {
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const postId  = btn.dataset.postId;
      const section = document.getElementById(`comments-${postId}`);
      const isOpen  = section.classList.contains('open');
      section.classList.toggle('open', !isOpen);
      if (!isOpen) loadComments(postId);
    });
  });

  // Comment send
  document.querySelectorAll('.comment-send-btn:not([data-bound])').forEach(btn => {
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => sendComment(btn.dataset.postId));
  });

  // Post menu
  document.querySelectorAll('.post-menu-btn:not([data-bound])').forEach(btn => {
    btn.dataset.bound = '1';
    const postId = btn.dataset.postId;
    createDropdown(btn, [
      { label: 'Eliminar post', icon: '🗑️', danger: true, action: () => deletePost(postId) }
    ]);
  });

  // Share
  document.querySelectorAll('.share-btn:not([data-bound])').forEach(btn => {
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const url = window.location.origin + window.location.pathname + `#post/${btn.dataset.postId}`;
      navigator.clipboard?.writeText(url);
      showToast('Enlace copiado', 'success');
    });
  });
}

/* ── Comments ── */
async function loadComments(postId) {
  const list = document.getElementById(`comments-list-${postId}`);
  if (!list || list.dataset.loaded) return;
  list.dataset.loaded = '1';
  list.innerHTML = '';
  const q    = query(collection(db, 'posts', postId, 'comments'), orderBy('createdAt','asc'), limit(20));
  const snap = await getDocs(q);
  if (snap.empty) { list.innerHTML = '<div style="color:var(--text-muted);font-size:0.82rem;padding:8px">Sin comentarios aún.</div>'; return; }
  const comments = [];
  for (const d of snap.docs) {
    const c      = { id: d.id, ...d.data() };
    const author = await getUserData(c.authorId);
    comments.push({ c, author });
  }
  list.innerHTML = comments.map(({ c, author }) => `
    <div class="comment-item">
      ${getAvatarHTML(author, 'sm')}
      <div class="comment-bubble">
        <div class="comment-author">${author.displayName}</div>
        <div class="comment-text">${formatPostContent(c.text)}</div>
        <div class="comment-time">${timeAgo(c.createdAt)}</div>
      </div>
    </div>`).join('');
}

async function sendComment(postId) {
  const user = getCurrentUser();
  if (!user) { showToast('Inicia sesión para comentar', 'info'); return; }
  const ta   = document.querySelector(`.comment-input[data-post-id="${postId}"]`);
  const text = ta?.value.trim();
  if (!text) return;
  ta.value = '';
  try {
    await addDoc(collection(db, 'posts', postId, 'comments'), {
      authorId: user.uid, text, createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, 'posts', postId), { commentsCount: increment(1) });
    const list = document.getElementById(`comments-list-${postId}`);
    if (list) {
      const author = await getUserData(user.uid);
      list.insertAdjacentHTML('beforeend', `
        <div class="comment-item animate-fade-in-up">
          ${getAvatarHTML(author, 'sm')}
          <div class="comment-bubble">
            <div class="comment-author">${author.displayName}</div>
            <div class="comment-text">${formatPostContent(text)}</div>
            <div class="comment-time">ahora</div>
          </div>
        </div>`);
    }
  } catch(e) { showToast('Error al comentar', 'error'); }
}

async function deletePost(postId) {
  const user = getCurrentUser();
  if (!user) return;
  try {
    await deleteDoc(doc(db, 'posts', postId));
    const el = document.querySelector(`[data-post-id="${postId}"].post-card`);
    if (el) { el.style.opacity = '0'; el.style.transform = 'scale(0.95)'; el.style.transition = '0.3s'; setTimeout(() => el.remove(), 300); }
    showToast('Post eliminado', 'success');
  } catch(e) { showToast('Error al eliminar', 'error'); }
}

/* ── Create Post ── */
function setupCreatePostBar() {
  document.getElementById('create-post-trigger')?.addEventListener('click', () => openModal('create-post-modal'));
  document.getElementById('create-post-photo-btn')?.addEventListener('click', () => { openModal('create-post-modal'); document.getElementById('post-image-input')?.click(); });
  document.getElementById('create-post-sticker-btn')?.addEventListener('click', () => router.navigate('stickers'));
}

function setupCreatePostModal() {
  // Llenar datos del usuario
  const user = getCurrentUser();
  if (user) {
    const nameEl = document.getElementById('post-author-name');
    const avatarEl = document.getElementById('post-author-avatar');
    if (nameEl) nameEl.textContent = user.displayName || 'Usuario';
    if (avatarEl) {
      if (user.photoURL) {
        avatarEl.style.backgroundImage = `url('${user.photoURL}')`;
        avatarEl.textContent = '';
      } else {
        avatarEl.textContent = (user.displayName || '?')[0].toUpperCase();
      }
    }
  }

  const imageInput = document.getElementById('post-image-input');
  const preview    = document.getElementById('post-image-preview');
  const removeBtn  = document.getElementById('remove-post-image');

  imageInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const err  = validateImageFile(file);
    if (err)   { showToast(err, 'error'); return; }
    postImageFile = file;
    const url = await readFileAsDataURL(file);
    if (preview) { preview.src = url; preview.parentElement.classList.remove('hidden'); }
  });

  removeBtn?.addEventListener('click', () => {
    postImageFile = null;
    if (imageInput) imageInput.value = '';
    preview?.parentElement.classList.add('hidden');
  });

  document.getElementById('create-post-media-btn')?.addEventListener('click', () => imageInput?.click());
  document.getElementById('create-post-smile-btn')?.addEventListener('click', () => showToast('Emoticones próximamente', 'info'));

  document.getElementById('publish-post-btn')?.addEventListener('click', publishPost);
}

async function publishPost() {
  const user    = getCurrentUser();
  if (!user)    { showToast('Inicia sesión', 'info'); return; }
  const text    = document.getElementById('post-text')?.value.trim();
  const viewOnce= document.getElementById('post-view-once')?.checked || false;
  const privacy = document.getElementById('post-privacy')?.value || 'public';
  const btn     = document.getElementById('publish-post-btn');
  if (!text && !postImageFile) { showToast('Escribe algo o agrega una imagen', 'warning'); return; }

  btn.disabled    = true;
  btn.textContent = 'Publicando...';
  try {
    let imageURL = '';
    if (postImageFile) {
      const compressed = await compressImage(postImageFile, 1080, 0.82);
      const storageRef = ref(storage, `posts/${user.uid}/${generateId('post')}`);
      await uploadBytes(storageRef, compressed);
      imageURL = await getDownloadURL(storageRef);
    }
    await addDoc(collection(db, 'posts'), {
      authorId:     user.uid,
      content:      text || '',
      imageURL,
      viewOnce,
      privacy:      privacy,
      viewedBy:     [],
      likes:        [],
      commentsCount: 0,
      type:         'post',
      createdAt:    serverTimestamp()
    });
    await updateDoc(doc(db, 'users', user.uid), { postsCount: increment(1) });
    closeModal('create-post-modal');
    document.getElementById('post-text').value = '';
    document.getElementById('post-privacy').value = 'public';
    document.getElementById('post-view-once').checked = false;
    postImageFile = null;
    document.getElementById('post-image-preview')?.parentElement.classList.add('hidden');
    if (document.getElementById('post-image-input')) document.getElementById('post-image-input').value = '';
    showToast('¡Post publicado! [+]', 'success');
    window.playSFX?.('send');
  } catch(e) {
    showToast('Error al publicar', 'error');
    console.error('publishPost error:', e);
  } finally {
    if (btn) {
      btn.disabled    = false;
      btn.textContent = 'Publicar';
    }
  }
}

/* ── Stories Bar ── */
export async function loadStories() {
  const list = document.getElementById('stories-list');
  if (!list) return;
  const user = getCurrentUser();
  const now  = new Date();
  const since= new Date(now - 24*3600*1000);

  list.innerHTML = `
    <div class="story-item" onclick="window.openUploadStory()">
      <div class="story-add-btn">
        [+]
        <span class="story-add-badge">+</span>
      </div>
      <span class="story-username story-your">Mi estado</span>
    </div>`;

  try {
    const q    = query(collection(db, 'posts'), where('type','==','story'), orderBy('createdAt','desc'), limit(10));
    const snap = await getDocs(q);
    const seenMap = {};
    const stories = [];
    const authorIds = [];

    for (const d of snap.docs) {
      const story  = { id: d.id, ...d.data() };
      if (story.expiresAt?.toDate && story.expiresAt.toDate() < now) continue;
      if (seenMap[story.authorId]) continue;
      seenMap[story.authorId] = true;
      authorIds.push(story.authorId);
      stories.push(story);
    }

    const authorMap = {};
    const authorPromises = authorIds.map(id => getUserData(id).then(u => authorMap[id] = u));
    await Promise.all(authorPromises);

    for (const story of stories) {
      const author = authorMap[story.authorId];
      const seen   = user && story.viewedBy?.includes(user.uid);
      const noteEl = author.noteText ? `<div class="story-note-bubble">${author.noteEmoji || ''}${author.noteText}</div>` : '';
      list.insertAdjacentHTML('beforeend', `
        <div class="story-item" onclick="window.viewStory('${story.id}')">
          <div class="story-avatar-wrap">
            ${noteEl}
            <div class="story-ring ${seen ? 'seen' : ''}">
              ${author.photoURL
                ? `<img class="story-avatar" src="${author.photoURL}" alt="${author.displayName}">`
                : `<div class="story-avatar avatar-placeholder">${(author.displayName||'?')[0]}</div>`}
            </div>
          </div>
          <span class="story-username">${author.displayName?.split(' ')[0] || 'User'}</span>
        </div>`);
    }
  } catch(e) { console.error('loadStories:', e); }
}

function refreshStories() { loadStories(); }

/* ── Suggested Users ── */
async function loadSuggestedUsers() {
  const container = document.getElementById('suggested-users-list');
  if (!container) return;
  const user = getCurrentUser();
  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(3)));
    const users = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.uid !== user?.uid).slice(0,5);
    container.innerHTML = users.map(u => `
      <div class="suggested-user" onclick="window.viewProfile('${u.uid}')">
        ${getAvatarHTML(u, 'sm')}
        <div class="suggested-user-info">
          <div class="suggested-user-name">${u.displayName}</div>
          <div class="suggested-user-bio">${u.bio ? u.bio.substring(0,40) : '@'+u.username}</div>
        </div>
        <div class="follow-btn-sm" data-uid="${u.uid}" onclick="event.stopPropagation();toggleFollow('${u.uid}',this)">Seguir</div>
      </div>`).join('');
  } catch(e) {}
}

/* Helper skeletons */
function createSkeletons(n) {
  return Array(n).fill(0).map(() => `
    <div class="post-card">
      <div class="post-header"><div class="skeleton" style="width:44px;height:44px;border-radius:50%"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:6px;margin-left:8px">
          <div class="skeleton" style="width:140px;height:12px;border-radius:4px"></div>
          <div class="skeleton" style="width:90px;height:10px;border-radius:4px"></div>
        </div>
      </div>
      <div class="skeleton" style="width:100%;height:150px;border-radius:12px;margin-top:8px"></div>
    </div>`).join('');
}

function emptyFeedHTML() {
  return `<div class="empty-state"><div class="empty-state-icon">[leaf]</div>
    <h3>Sin publicaciones aún</h3>
    <p>Sé el primero en publicar algo en Zamora MSG</p>
    <button class="btn btn-primary" onclick="openModal('create-post-modal')">Crear post</button></div>`;
}

// Global helpers
window.viewProfile     = (uid) => router.navigate('profile', { uid });
window.openUploadStory = ()    => router.navigate('upload-story');
