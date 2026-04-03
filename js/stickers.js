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

let canvas, ctx;
let stickerText     = '';
let textColor       = '#4ADE80';
let textShadow      = false;
let bgType          = 'transparent';
let bgColor         = '';
let fontFamily      = 'Outfit, sans-serif';
let fontSize        = 42;
let textAlign       = 'center';
let textBold        = true;
let textItalic      = false;
let emojiOverlay    = '';
const CANVAS_SIZE   = 400;

/* ─── Init Creator ─── */
export function initStickerCreator() {
  canvas = document.getElementById('sticker-canvas');
  if (!canvas) return;
  canvas.width = canvas.height = CANVAS_SIZE;
  ctx = canvas.getContext('2d');
  renderCanvas();

  // Text input
  document.getElementById('sticker-text-input')?.addEventListener('input', (e) => {
    stickerText = e.target.value; renderCanvas();
  });

  // Colors
  document.querySelectorAll('.sticker-color-swatch').forEach(s => {
    s.addEventListener('click', () => {
      document.querySelectorAll('.sticker-color-swatch').forEach(x => x.classList.remove('active'));
      s.classList.add('active');
      textColor = s.dataset.color; renderCanvas();
    });
  });

  // Font size
  document.getElementById('sticker-font-size')?.addEventListener('input', (e) => {
    fontSize = parseInt(e.target.value);
    document.getElementById('font-size-val').textContent = fontSize;
    renderCanvas();
  });

  // Font family
  document.getElementById('sticker-font-select')?.addEventListener('change', (e) => {
    fontFamily = e.target.value; renderCanvas();
  });

  // Style buttons
  document.getElementById('sticker-bold')?.addEventListener('click', (e) => {
    textBold = !textBold; e.currentTarget.classList.toggle('active', textBold); renderCanvas();
  });
  document.getElementById('sticker-italic')?.addEventListener('click', (e) => {
    textItalic = !textItalic; e.currentTarget.classList.toggle('active', textItalic); renderCanvas();
  });
  document.getElementById('sticker-shadow')?.addEventListener('click', (e) => {
    textShadow = !textShadow; e.currentTarget.classList.toggle('active', textShadow); renderCanvas();
  });

  // Background options
  document.querySelectorAll('.sticker-bg-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.sticker-bg-option').forEach(x => x.classList.remove('active'));
      opt.classList.add('active');
      bgType  = opt.dataset.type;
      bgColor = opt.dataset.gradient || opt.dataset.color || '';
      renderCanvas();
    });
  });

  // Emoji bar
  document.querySelectorAll('.sticker-emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      emojiOverlay = emojiOverlay === btn.textContent ? '' : btn.textContent;
      renderCanvas();
    });
  });

  // Canvas action buttons
  document.getElementById('canvas-clear-btn')?.addEventListener('click', () => {
    stickerText = ''; emojiOverlay = '';
    document.getElementById('sticker-text-input').value = '';
    renderCanvas();
  });
  document.getElementById('canvas-download-btn')?.addEventListener('click', downloadSticker);
  document.getElementById('canvas-save-btn')?.addEventListener('click', saveSticker);
}

/* ─── Render Canvas ─── */
function renderCanvas() {
  if (!ctx) return;
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Draw background
  if (bgType === 'color' && bgColor) {
    ctx.fillStyle = bgColor; ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  } else if (bgType === 'gradient' && bgColor) {
    const grad = parseGradientToCanvas(bgColor);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }
  // transparent: don't fill

  // Draw emoji
  if (emojiOverlay) {
    ctx.font = `${CANVAS_SIZE * 0.45}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emojiOverlay, CANVAS_SIZE / 2, CANVAS_SIZE / 2);
  }

  // Draw text
  if (stickerText) {
    const weight = textBold ? 'bold ' : '';
    const style  = textItalic ? 'italic ' : '';
    ctx.font = `${style}${weight}${fontSize}px ${fontFamily}`;
    ctx.textAlign    = textAlign;
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = textColor;

    if (textShadow) {
      ctx.shadowColor   = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur    = 8;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
    } else {
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
    }

    const lines = wrapText(stickerText, CANVAS_SIZE - 40, ctx);
    const lineH = fontSize * 1.3;
    const totalH = lines.length * lineH;
    const startY = (CANVAS_SIZE - totalH) / 2 + lineH / 2 + (emojiOverlay ? CANVAS_SIZE * 0.25 : 0);
    lines.forEach((line, i) => {
      ctx.fillText(line, CANVAS_SIZE / 2, startY + i * lineH);
    });
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  }
}

function wrapText(text, maxWidth, context) {
  const words  = text.split(' ');
  const lines  = [];
  let current  = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (context.measureText(test).width > maxWidth && current) {
      lines.push(current); current = word;
    } else { current = test; }
  }
  if (current) lines.push(current);
  return lines;
}

function parseGradientToCanvas(gradientStr) {
  // Simplified: extract colors from linear-gradient(135deg, #color1, #color2)
  const matches = gradientStr.match(/#[0-9a-fA-F]{3,6}/g) || ['#4ADE80','#22C55E'];
  const grad    = ctx.createLinearGradient(CANVAS_SIZE * 0.1, CANVAS_SIZE * 0.1, CANVAS_SIZE * 0.9, CANVAS_SIZE * 0.9);
  grad.addColorStop(0, matches[0] || '#4ADE80');
  grad.addColorStop(1, matches[1] || '#22C55E');
  return grad;
}

/* ─── Download ─── */
function downloadSticker() {
  const link   = document.createElement('a');
  link.download = `sticker-${Date.now()}.png`;
  link.href     = canvas.toDataURL('image/png');
  link.click();
}

/* ─── Save to Firebase ─── */
async function saveSticker() {
  const user = getCurrentUser();
  if (!user) { showToast('Inicia sesión para guardar', 'info'); return; }
  const name = document.getElementById('sticker-name-input')?.value.trim() || 'Mi Sticker';
  const btn  = document.getElementById('canvas-save-btn');
  btn.disabled    = true; btn.textContent = 'Guardando...';
  try {
    const blob     = await canvasToBlob(canvas, 'image/png');
    const stickRef = ref(storage, `stickers/${user.uid}/${generateId('stk')}.png`);
    await uploadBytes(stickRef, blob);
    const imageURL = await getDownloadURL(stickRef);
    await addDoc(collection(db, 'stickers'), {
      authorId: user.uid, name, imageURL,
      tags: [], usageCount: 0, createdAt: serverTimestamp()
    });
    showToast(`Sticker "${name}" guardado 🎨`, 'success');
    loadStickerGallery(); // refresh gallery
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
