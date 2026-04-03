// =====================================================
// ZAMORA MSG — Main App Entry Point
// =====================================================

import { auth }           from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { initAuthUI }     from './auth.js';
import { router, initRouter } from './router.js';
import { initFeed, loadStories } from './feed.js';
import { initMessages }   from './messages.js';
import { initProfile }    from './profile.js';
import { initNotes }      from './notes.js';
import { initSettings }   from './settings.js';
import { initStickerCreator, loadStickerGallery } from './stickers.js';
import { initUploadStory, initStoryViewer, viewStory } from './stories.js';
import { showToast, getAvatarHTML }      from './ui.js';
import { db } from './firebase-config.js';
import { collection, query, where, getDocs, limit, orderBy } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// ── Splash Screen ──
const splash    = document.getElementById('splash-screen');
const splashBar = document.getElementById('splash-bar-fill');

// Animate splash bar
setTimeout(() => { if (splashBar) splashBar.style.width = '70%'; }, 200);
setTimeout(() => { if (splashBar) splashBar.style.width = '90%'; }, 1200);

// ── Auth State Observer ──
onAuthStateChanged(auth, (user) => {
  // Mark splash as complete
  setTimeout(() => { if (splashBar) splashBar.style.width = '100%'; }, 300);

  setTimeout(() => {
    splash?.classList.add('fade-out');
    if (user) {
      showApp(user);
    } else {
      showAuthPage();
    }
  }, 600);
});

function showAuthPage() {
  const authPage = document.getElementById('auth-page');
  const appEl    = document.getElementById('app');
  if (authPage) { authPage.style.display = 'flex'; authPage.classList.add('active'); }
  if (appEl)    { appEl.style.display = 'none'; appEl.classList.remove('active'); }
  initAuthUI();
}

function showApp(user) {
  const authPage = document.getElementById('auth-page');
  const appEl    = document.getElementById('app');
  if (authPage) { authPage.style.display = 'none'; authPage.classList.remove('active'); }
  if (appEl)    { appEl.style.display = 'flex'; appEl.classList.add('active'); }

  // Update sidebar user info
  updateSidebarUser(user);

  // Register routes
  router.register('feed',         (p) => initFeed(p));
  router.register('messages',     (p) => initMessages(p));
  router.register('profile',      (p) => initProfile(p));
  router.register('notes',        (p) => initNotes(p));
  router.register('settings',     (p) => initSettings(p));
  router.register('stickers',     (p) => { initStickerCreator(); loadStickerGallery(); });
  router.register('upload-story', (p) => initUploadStory(p));

  // Init router & navigate to initial page
  initRouter();
  initStoryViewer();

  const hash = window.location.hash.slice(1).split('/')[0];
  const validPages = ['feed','messages','profile','notes','settings','stickers','upload-story'];
  router.navigate(validPages.includes(hash) ? hash : 'feed');
}

async function updateSidebarUser(user) {
  const nameEl   = document.getElementById('sidebar-user-name');
  const handleEl = document.getElementById('sidebar-user-handle');
  const avatarEl = document.getElementById('sidebar-user-avatar');
  const initEl   = document.getElementById('sidebar-user-initial');

  if (nameEl)   nameEl.textContent = user.displayName || 'Usuario';
  if (handleEl) handleEl.textContent = user.email?.split('@')[0] || '';
  if (user.photoURL && avatarEl) {
    avatarEl.src          = user.photoURL;
    avatarEl.style.display = 'block';
    if (initEl) initEl.style.display = 'none';
  } else if (initEl) {
    initEl.textContent = (user.displayName || '?')[0].toUpperCase();
    initEl.style.display = 'flex';
    if (avatarEl) avatarEl.style.display = 'none';
  }
}

// ── Global error handler ──
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
  if (e.reason?.code?.startsWith('auth/') || e.reason?.code?.startsWith('storage/') || e.reason?.code?.startsWith('firestore/')) {
    console.warn('Firebase error handled silently:', e.reason?.code);
  }
});

// ── Global Search ──
const searchInput = document.getElementById('global-search-input');
const searchResults = document.getElementById('global-search-results');
let searchTimeout;

if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const term = e.target.value.trim().toLowerCase();
    
    if (term.length < 2) {
      searchResults.classList.add('hidden');
      return;
    }
    
    // Debounce
    searchTimeout = setTimeout(async () => {
      searchResults.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted)">Buscando...</div>';
      searchResults.classList.remove('hidden');
      
      try {
        // Find users starting with the term in username
        // Firebase doesn't have great substring search, so we use string boundaries
        const endTerm = term + '\uf8ff';
        const q = query(
          collection(db, 'users'),
          where('username', '>=', term),
          where('username', '<=', endTerm),
          limit(6)
        );
        
        const snap = await getDocs(q);
        
        if (snap.empty) {
          searchResults.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-muted)">No se encontraron perfiles.</div>';
          return;
        }
        
        let html = '';
        snap.forEach(docSnap => {
          const u = docSnap.data();
          html += `
            <div style="display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;border-bottom:1px solid var(--border);" 
                 onmouseover="this.style.background='var(--bg-hover)'" 
                 onmouseout="this.style.background=''"
                 onclick="document.getElementById('global-search-results').classList.add('hidden'); document.getElementById('global-search-input').value=''; window.location.hash='profile/${docSnap.id}'">
              ${getAvatarHTML(u, 'sm')}
              <div style="flex:1;">
                <div style="font-weight:600;font-size:0.9rem;color:var(--text-primary)">${u.displayName || 'Usuario'}</div>
                <div style="font-size:0.8rem;color:var(--text-muted)">@${u.username}</div>
              </div>
            </div>`;
        });
        searchResults.innerHTML = html;
        
      } catch(err) {
        searchResults.innerHTML = '<div style="padding:12px;text-align:center;color:var(--danger)">Error al buscar</div>';
      }
    }, 400); // 400ms debounce
  });

  // Hide when clicking outside
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
      searchResults.classList.add('hidden');
    }
  });
}
