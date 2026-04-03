// =====================================================
// ZAMORA MSG — Stories Module
// =====================================================

import { db, storage }     from './firebase-config.js';
import { getCurrentUser }  from './auth.js';
import {
  collection, addDoc, getDoc, doc, updateDoc,
  arrayUnion, serverTimestamp, query, where,
  orderBy, getDocs, limit
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";
import { showToast, getAvatarHTML } from './ui.js';
import { compressImage, validateImageFile, readFileAsDataURL, generateId, timeAgo, isExpired } from './utils.js';

let currentStoryId     = null;
let storyProgress      = null;
let storyTimer         = null;
let storyViewOnce      = false;
let viewOnceOpened     = false;
let STORY_DURATION_MS  = 5000;

/* ── Upload Story ── */
export function initUploadStory() {
  const dropzone = document.getElementById('story-drop-zone');
  const fileInput= document.getElementById('story-file-input');
  const preview  = document.getElementById('story-preview');
  const viewToggle = document.getElementById('story-view-once-toggle');

  if (!dropzone) return;

  dropzone.addEventListener('click', () => fileInput?.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', ()  => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault(); dropzone.classList.remove('drag-over');
    const file = e.dataTransfer?.files[0];
    if (file) handleStoryFile(file);
  });
  fileInput?.addEventListener('change', (e) => { if (e.target.files[0]) handleStoryFile(e.target.files[0]); });

  viewToggle?.addEventListener('click', () => {
    viewToggle.classList.toggle('on');
    storyViewOnce = viewToggle.classList.contains('on');
  });

  document.getElementById('publish-story-btn')?.addEventListener('click', publishStory);
}

async function handleStoryFile(file) {
  const err = validateImageFile(file, 20);
  if (err)  { showToast(err, 'error'); return; }
  const url = await readFileAsDataURL(file);
  window._storyFile = file;
  const preview = document.getElementById('story-preview');
  const dropzone = document.getElementById('story-drop-zone');
  if (preview && dropzone) {
    preview.src = url;
    preview.style.display = 'block';
    dropzone.style.display = 'none';
    document.getElementById('story-preview-container').style.display = 'flex';
  }
}

async function publishStory() {
  const user = getCurrentUser();
  if (!user)         { showToast('Inicia sesión', 'info'); return; }
  if (!window._storyFile) { showToast('Selecciona una imagen o video', 'warning'); return; }

  const btn = document.getElementById('publish-story-btn');
  btn.disabled    = true; btn.textContent = 'Publicando...';
  try {
    const compressed = await compressImage(window._storyFile, 1080, 0.85);
    const storageRef = ref(storage, `stories/${user.uid}/${generateId('story')}`);
    await uploadBytes(storageRef, compressed);
    const imageURL   = await getDownloadURL(storageRef);
    const expiresAt  = new Date(Date.now() + 24*3600*1000);

    await addDoc(collection(db, 'posts'), {
      authorId:  user.uid, type: 'story', imageURL,
      viewOnce:  storyViewOnce, viewedBy: [],
      expiresAt, createdAt: serverTimestamp()
    });
    window._storyFile = null;
    showToast('Estado publicado 🎉', 'success');
    // Go back to feed
    import('./router.js').then(({ router }) => router.navigate('feed'));
  } catch(e) {
    showToast('Error al publicar estado', 'error');
    console.error(e);
  } finally {
    btn.disabled    = false; btn.textContent = 'Publicar Estado';
  }
}

/* ── Story Viewer ── */
export function initStoryViewer() {
  const viewer    = document.getElementById('story-viewer');
  const closeBtn  = document.getElementById('story-viewer-close');
  const prevZone  = document.getElementById('story-tap-prev');
  const nextZone  = document.getElementById('story-tap-next');
  const replyInput= document.getElementById('story-reply-input');

  closeBtn?.addEventListener('click', closeStoryViewer);
  prevZone?.addEventListener('click', () => navigateStory(-1));
  nextZone?.addEventListener('click', () => navigateStory(1));

  document.addEventListener('keydown', (e) => {
    if (!viewer || viewer.classList.contains('hidden')) return;
    if (e.key === 'Escape')    closeStoryViewer();
    if (e.key === 'ArrowLeft') navigateStory(-1);
    if (e.key === 'ArrowRight') navigateStory(1);
  });
}

let allStories   = [];
let storyIndex   = 0;

export async function viewStory(storyId) {
  const user = getCurrentUser();
  try {
    // Load user's stories
    const d     = await getDoc(doc(db, 'posts', storyId));
    if (!d.exists()) { showToast('Estado no encontrado', 'error'); return; }
    const story = { id: storyId, ...d.data() };
    if (isExpired(story.createdAt, 24)) { showToast('Este estado expiró', 'info'); return; }

    // Load all stories from same author
    const q    = query(collection(db, 'posts'), where('authorId','==',story.authorId), where('type','==','story'), orderBy('createdAt','asc'), limit(10));
    const snap = await getDocs(q);
    allStories  = snap.docs.map(d2 => ({ id: d2.id, ...d2.data() }));
    storyIndex  = allStories.findIndex(s => s.id === storyId);
    if (storyIndex < 0) storyIndex = 0;

    openStoryViewer(allStories[storyIndex]);

    // Mark as viewed
    if (user) {
      await updateDoc(doc(db, 'posts', storyId), { viewedBy: arrayUnion(user.uid) });
    }
  } catch(e) { console.error(e); showToast('Error al abrir estado', 'error'); }
}
window.viewStory = viewStory;

async function openStoryViewer(story) {
  const viewer = document.getElementById('story-viewer');
  if (!viewer) return;
  viewer.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  const user   = getCurrentUser();
  const author = await getAuthorData(story.authorId);

  // Header
  document.getElementById('story-author-name')  .textContent = author.displayName || 'Usuario';
  document.getElementById('story-author-time')  .textContent = timeAgo(story.createdAt);
  const avatarEl = document.getElementById('story-author-avatar');
  if (avatarEl) { avatarEl.src = author.photoURL || ''; avatarEl.style.display = author.photoURL ? 'block' : 'none'; }

  // Media
  const mediaWrap = document.getElementById('story-media-wrap');
  if (mediaWrap) {
    mediaWrap.innerHTML = story.imageURL
      ? `<img class="story-image" src="${story.imageURL}" alt="story">`
      : `<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--text-muted);font-size:1.2rem">Sin imagen</div>`;
  }

  // View-once
  const viewOnceOverlay = document.getElementById('view-once-overlay');
  viewOnceOpened = false;
  if (story.viewOnce && viewOnceOverlay) {
    const alreadyViewed = user && story.viewedBy?.includes(user.uid);
    if (alreadyViewed) {
      mediaWrap.innerHTML = `<div class="view-once-overlay" style="position:static;background:transparent;gap:8px"><span style="font-size:3rem">🔒</span><p style="color:rgba(255,255,255,0.7)">Ya viste esta imagen</p></div>`;
      viewOnceOverlay.classList.add('hidden');
    } else {
      viewOnceOverlay.classList.remove('hidden');
      if (mediaWrap) mediaWrap.style.filter = 'blur(20px)';
    }
  } else if (viewOnceOverlay) {
    viewOnceOverlay.classList.add('hidden');
    if (mediaWrap) mediaWrap.style.filter = '';
  }

  // Bind reveal
  document.getElementById('reveal-view-once-btn')?.addEventListener('click', revealViewOnce, { once: true });

  // Progress bars
  setupProgressBars();
  startStoryTimer(story);
}

function revealViewOnce() {
  if (viewOnceOpened) return;
  viewOnceOpened = true;
  const overlay  = document.getElementById('view-once-overlay');
  const mediaWrap= document.getElementById('story-media-wrap');
  overlay?.classList.add('hidden');
  if (mediaWrap) mediaWrap.style.filter = '';
  // Destroy after 3s
  setTimeout(() => {
    if (mediaWrap) {
      mediaWrap.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;color:rgba(255,255,255,0.5)"><span style="font-size:3rem">💨</span><p>La imagen fue destruida</p></div>`;
    }
  }, 3000);
}

function setupProgressBars() {
  const wrap = document.getElementById('story-progress-wrap');
  if (!wrap) return;
  wrap.innerHTML = allStories.map((_, i) => `
    <div class="story-progress-bar">
      <div class="story-progress-fill ${i < storyIndex ? 'done' : ''}" id="prog-${i}"></div>
    </div>`).join('');
}

function startStoryTimer(story) {
  clearTimeout(storyTimer);
  const fill = document.getElementById(`prog-${storyIndex}`);
  if (fill) {
    fill.style.transition = `width ${STORY_DURATION_MS/1000}s linear`;
    fill.style.width = '100%';
  }
  storyTimer = setTimeout(() => navigateStory(1), STORY_DURATION_MS);
}

function navigateStory(dir) {
  clearTimeout(storyTimer);
  const newIdx = storyIndex + dir;
  if (newIdx < 0)               { closeStoryViewer(); return; }
  if (newIdx >= allStories.length) { closeStoryViewer(); return; }
  storyIndex = newIdx;
  openStoryViewer(allStories[storyIndex]);
}

function closeStoryViewer() {
  clearTimeout(storyTimer);
  const viewer = document.getElementById('story-viewer');
  viewer?.classList.add('hidden');
  document.body.style.overflow = '';
  allStories = []; storyIndex = 0;
}

const authorCache = {};
async function getAuthorData(uid) {
  if (authorCache[uid]) return authorCache[uid];
  const d = await getDoc(doc(db, 'users', uid));
  authorCache[uid] = d.exists() ? d.data() : { displayName: 'Usuario', photoURL: '' };
  return authorCache[uid];
}
