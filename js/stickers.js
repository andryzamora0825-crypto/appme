// =====================================================
// ZAMORA MSG — Stickers Module
// =====================================================

import { db, storage }    from './firebase-config.js';
import { getCurrentUser } from './auth.js';
import {
  collection, addDoc, getDocs, query, orderBy,
  limit, serverTimestamp, where, doc, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";
import { showToast } from './ui.js';
import { generateId, STICKER_COLORS, STICKER_BG_GRADIENTS, canvasToBlob } from './utils.js';

let uploadedStickerFile = null;

/* ─── Init Creator ─── */
export function initStickerCreator() {
  const uploadInput = document.getElementById('sticker-image-upload');
  const previewContainer = document.getElementById('sticker-preview-container');
  const uploadPrompt = document.getElementById('sticker-upload-prompt');
  const previewImg = document.getElementById('sticker-preview-img');
  
  uploadInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) { showToast('Selecciona una imagen', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('El archivo es muy grande (Max 5MB)', 'error'); return; }

    uploadedStickerFile = file;
    
    // Show preview
    const reader = new FileReader();
    reader.onload = (event) => {
      previewImg.src = event.target.result;
      uploadPrompt.style.display = 'none';
      previewContainer.style.display = 'flex';
      previewContainer.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('sticker-cancel-btn')?.addEventListener('click', () => {
    uploadedStickerFile = null;
    uploadInput.value = '';
    previewImg.src = '';
    const nameInp = document.getElementById('sticker-name-input');
    if (nameInp) nameInp.value = '';
    previewContainer.style.display = 'none';
    uploadPrompt.style.display = 'flex';
  });

  document.getElementById('sticker-save-btn')?.addEventListener('click', saveSticker);
}

/* ─── Save to Firebase ─── */
async function saveSticker() {
  const user = getCurrentUser();
  if (!user) { showToast('Inicia sesión para guardar', 'info'); return; }
  if (!uploadedStickerFile) { showToast('Primero selecciona una imagen', 'info'); return; }

  const nameInput = document.getElementById('sticker-name-input');
  const name = nameInput?.value.trim() || 'Sticker';
  const btn = document.getElementById('sticker-save-btn');
  btn.disabled = true; btn.textContent = 'Guardando...';

  try {
    const stickRef = ref(storage, `stickers/${user.uid}/${generateId('stk')}.png`);
    await uploadBytes(stickRef, uploadedStickerFile);
    const imageURL = await getDownloadURL(stickRef);
    
    await addDoc(collection(db, 'stickers'), {
      authorId: user.uid, name, imageURL,
      tags: [], usageCount: 0, createdAt: serverTimestamp()
    });
    
    showToast(`Sticker guardado exitosamente 🎨`, 'success');
    
    // Reset UI
    document.getElementById('sticker-cancel-btn')?.click();
    
    // Refresh gallery
    loadStickerGallery();
  } catch(e) {
    showToast('Error al guardar sticker', 'error'); console.error(e);
  } finally {
    btn.disabled = false; btn.textContent = '💾 Guardar Sticker';
  }
}


/* ─── Gallery ─── */
export async function loadStickerGallery(filterUid = null) {
  const grid = document.getElementById('sticker-gallery-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="flex-center" style="padding:40px;grid-column:1/-1"><div class="spinner"></div></div>';
  try {
    let q;
    if (filterUid) {
      q = query(collection(db,'stickers'), where('authorId','==',filterUid), orderBy('createdAt','desc'), limit(40));
    } else {
      q = query(collection(db,'stickers'), orderBy('createdAt','desc'), limit(40));
    }
    const snap = await getDocs(q);
    if (snap.empty) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🎨</div><h3>Sin stickers aún</h3><p>¡Crea el primero!</p></div>`;
      return;
    }
    const user = getCurrentUser();
    grid.innerHTML = snap.docs.map(d => {
      const s   = { id: d.id, ...d.data() };
      const own = user && s.authorId === user.uid;
      return `
      <div class="sticker-card" data-sticker-id="${s.id}">
        <div class="sticker-card-img">
          <img src="${s.imageURL}" alt="${s.name}" loading="lazy">
        </div>
        <div class="sticker-card-info">
          <div class="sticker-card-name">${s.name}</div>
          <div class="sticker-card-author">×${s.usageCount || 0} usos</div>
        </div>
        <div class="sticker-card-actions">
          <div class="sticker-card-btn" onclick="window.sendStickerToChat('${s.id}','${s.imageURL}','${s.name}')">💬 Chat</div>
          <div class="sticker-card-btn" onclick="window.postSticker('${s.id}','${s.imageURL}','${s.name}')">📌 Post</div>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p>Error cargando stickers</p></div>';
    console.error(e);
  }
}

/* ─── Send sticker to chat ─── */
window.sendStickerToChat = async (stickerId, imageURL, name) => {
  // Store selected sticker and navigate to messages
  window._pendingSticker = { stickerId, imageURL, name };
  showToast(`Sticker "${name}" listo para enviar 💬`, 'success');
  import('./router.js').then(({ router }) => router.navigate('messages'));
};

/* ─── Post sticker to feed ─── */
window.postSticker = async (stickerId, imageURL, name) => {
  const user = getCurrentUser();
  if (!user) { showToast('Inicia sesión', 'info'); return; }
  try {
    await addDoc(collection(db, 'posts'), {
      authorId: user.uid, type: 'post', content: `🎨 ${name}`,
      stickerURL: imageURL, stickerRef: stickerId,
      likes: [], commentsCount: 0, viewOnce: false, viewedBy: [],
      createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, 'stickers', stickerId), { usageCount: increment(1) });
    showToast('Sticker publicado en el feed 🎉', 'success');
    import('./router.js').then(({ router }) => router.navigate('feed'));
  } catch(e) { showToast('Error al publicar', 'error'); }
};

/* ─── Sticker Picker for Chat ─── */
export async function loadStickerPicker(containerId) {
  const grid = document.getElementById(containerId);
  if (!grid) return;
  const user = getCurrentUser();
  try {
    const q    = query(collection(db,'stickers'), orderBy('createdAt','desc'), limit(20));
    const snap = await getDocs(q);
    grid.innerHTML = snap.docs.map(d => {
      const s = { id: d.id, ...d.data() };
      return `<div class="sticker-picker-item" onclick="window._onStickerPick('${s.id}','${s.imageURL}','${s.name}')">
        <img src="${s.imageURL}" alt="${s.name}" loading="lazy">
      </div>`;
    }).join('') || '<p style="padding:12px;color:var(--text-muted);font-size:0.8rem">Sin stickers</p>';
  } catch(e) {}
}
