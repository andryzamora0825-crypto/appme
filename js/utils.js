// =====================================================
// ZAMORA MSG — Utilities
// =====================================================

/* ── Image Compression ── */
export function compressImage(file, maxWidth = 1080, quality = 0.82) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(resolve, 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ── File validation ── */
export function validateImageFile(file, maxMB = 10) {
  const allowed = ['image/jpeg','image/png','image/gif','image/webp'];
  if (!allowed.includes(file.type)) return 'Formato no soportado. Usa JPG, PNG, GIF o WebP.';
  if (file.size > maxMB * 1024 * 1024) return `El archivo es demasiado grande. Máximo ${maxMB}MB.`;
  return null;
}

/* ── Date formatting ── */
export function formatDate(timestamp) {
  if (!timestamp) return '';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleDateString('es-MX', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
}

export function formatDateTime(timestamp) {
  if (!timestamp) return '';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleString('es-MX', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

export function timeAgo(timestamp) {
  if (!timestamp) return '';
  const d    = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now  = new Date();
  const diff = now - d;
  const sec  = Math.floor(diff / 1000);
  const min  = Math.floor(diff / 60000);
  const hr   = Math.floor(diff / 3600000);
  const day  = Math.floor(diff / 86400000);
  const wk   = Math.floor(diff / 604800000);
  if (sec  < 30)  return 'ahora';
  if (min  < 1)   return `${sec}s`;
  if (min  < 60)  return `${min}m`;
  if (hr   < 24)  return `${hr}h`;
  if (day  < 7)   return `${day}d`;
  if (wk   < 4)   return `${wk}sem`;
  return d.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
}

export function isExpired(timestamp, hours = 24) {
  if (!timestamp) return true;
  const d    = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now  = new Date();
  return (now - d) > hours * 3600000;
}

export function expiresIn(timestamp, hours = 24) {
  if (!timestamp) return 'Expirado';
  const d     = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const exp   = new Date(d.getTime() + hours * 3600000);
  const now   = new Date();
  const diff  = exp - now;
  if (diff <= 0) return 'Expirado';
  const h     = Math.floor(diff / 3600000);
  const m     = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `Expira en ${h}h ${m}m`;
  return `Expira en ${m}m`;
}

/* ── String utils ── */
export function truncate(str, len = 100) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '…' : str;
}

export function sanitizeHTML(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

export function parseHashtags(text) {
  return sanitizeHTML(text).replace(/#(\w+)/g, '<span class="hashtag" data-tag="$1">#$1</span>');
}

export function parseMentions(text) {
  return text.replace(/@(\w+)/g, '<span class="mention" data-user="$1">@$1</span>');
}

export function formatPostContent(text) {
  return parseMentions(parseHashtags(text));
}

/* ── ID generation ── */
export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/* ── Canvas helpers for stickers ── */
export function canvasToBlob(canvas, type = 'image/png', quality = 1) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export function canvasToDataURL(canvas, type = 'image/png') {
  return canvas.toDataURL(type);
}

/* ── File reader ── */
export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ── Local Storage helpers ── */
export const storage_local = {
  get: (key, def = null) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? def; }
    catch { return def; }
  },
  set: (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch { return false; }
  },
  remove: (key) => localStorage.removeItem(key)
};

/* ── Debounce ── */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

/* ── Scroll lock ── */
export function lockScroll()   { document.body.style.overflow = 'hidden'; }
export function unlockScroll() { document.body.style.overflow = ''; }

/* ── Notification permission ── */
export async function requestNotifPermission() {
  if (!('Notification' in window)) return false;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

/* ── Copy to clipboard ── */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    el.remove();
    return true;
  }
}

/* ── Color helpers ── */
export const STICKER_COLORS = [
  '#4ADE80','#22C55E','#A3E635','#F87171','#FB923C',
  '#FBBF24','#60A5FA','#A78BFA','#F472B6','#FFFFFF','#1A1A1A'
];

export const STICKER_BG_GRADIENTS = [
  'linear-gradient(135deg,#4ADE80,#22C55E)',
  'linear-gradient(135deg,#1a1a1a,#0a1a0a)',
  'linear-gradient(135deg,#3730A3,#7C3AED)',
  'linear-gradient(135deg,#BE185D,#F472B6)',
  'linear-gradient(135deg,#0E7490,#06B6D4)',
  'linear-gradient(135deg,#92400E,#FBBF24)',
];
