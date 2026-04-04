// =====================================================
// ZAMORA MSG — Notes Module (Instagram style)
// =====================================================

import { db }             from './firebase-config.js';
import { getCurrentUser } from './auth.js';
import {
  doc, getDoc, updateDoc, getDocs, query,
  collection, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { showToast, openModal, closeModal, getAvatarHTML } from './ui.js';
import { expiresIn, isExpired, timeAgo } from './utils.js';

const MAX_NOTE_CHARS = 60;

/* ── Init Notes Page ── */
export async function initNotes() {
  await renderYourNote();
  await loadFollowingNotes();
  setupNoteEditor();
}

/* ── Your Note ── */
async function renderYourNote() {
  const user = getCurrentUser();
  if (!user) return;
  const snap = await getDoc(doc(db, 'users', user.uid));
  const u    = snap.data() || {};

  const currentNoteWrap = document.getElementById('your-current-note');
  const editorWrap      = document.getElementById('your-note-editor');
  const noteEmoji       = document.getElementById('your-note-display-emoji');
  const noteText        = document.getElementById('your-note-display-text');
  const noteExpires     = document.getElementById('your-note-expires');

  if (u.noteText && !isExpired(u.noteUpdatedAt, 24)) {
    // Show existing note
    if (currentNoteWrap) currentNoteWrap.classList.remove('hidden');
    if (editorWrap)      editorWrap.classList.add('hidden');
    if (noteEmoji)       noteEmoji.textContent = u.noteEmoji || '[msg]';
    if (noteText)        noteText.textContent  = u.noteText;
    if (noteExpires)     noteExpires.textContent = expiresIn(u.noteUpdatedAt, 24);
  } else {
    // Show editor
    if (currentNoteWrap) currentNoteWrap.classList.add('hidden');
    if (editorWrap)      editorWrap.classList.remove('hidden');
  }

  // Pre-fill editor
  const emojiPicker = document.getElementById('note-emoji-selected');
  const textarea    = document.getElementById('note-textarea');
  if (emojiPicker && u.noteEmoji) emojiPicker.textContent = u.noteEmoji;
  if (textarea    && u.noteText)  textarea.value = u.noteText;
}

/* ── Note Editor ── */
function setupNoteEditor() {
  const textarea  = document.getElementById('note-textarea');
  const charCount = document.getElementById('note-char-count');
  const saveBtn   = document.getElementById('save-note-btn');
  const deleteBtn = document.getElementById('delete-note-btn');
  const editBtn   = document.getElementById('edit-note-btn');

  // Emoji picker button
  const emojis = ['[msg]','[smile]','[laugh]','[fire]','[heart]','[eye]','[*]','[think]','[cool]','[strong]','[music]','[leaf]','[bolt]','[hug]','[happy]'];
  const emojiBtn = document.getElementById('note-emoji-picker-btn');
  const emojiPopup = document.getElementById('note-emoji-popup');

  emojiBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!emojiPopup) return;
    if (emojiPopup.classList.contains('hidden')) {
      emojiPopup.innerHTML = emojis.map(em => `<span class="emoji-btn" onclick="selectNoteEmoji('${em}')">${em}</span>`).join('');
      emojiPopup.classList.remove('hidden');
    } else {
      emojiPopup.classList.add('hidden');
    }
  });

  window.selectNoteEmoji = (em) => {
    const sel = document.getElementById('note-emoji-selected');
    if (sel) sel.textContent = em;
    emojiPopup?.classList.add('hidden');
  };

  document.addEventListener('click', () => emojiPopup?.classList.add('hidden'));

  // Char count
  textarea?.addEventListener('input', () => {
    const len  = textarea.value.length;
    const left = MAX_NOTE_CHARS - len;
    if (charCount) {
      charCount.textContent = `${len}/${MAX_NOTE_CHARS}`;
      charCount.className   = `note-char-count ${left < 10 ? 'limit' : ''}`;
    }
    if (textarea.value.length > MAX_NOTE_CHARS) textarea.value = textarea.value.substring(0, MAX_NOTE_CHARS);
  });

  saveBtn?.addEventListener('click', saveNote);
  deleteBtn?.addEventListener('click', deleteNote);
  editBtn?.addEventListener('click', () => {
    document.getElementById('your-current-note')?.classList.add('hidden');
    document.getElementById('your-note-editor')?.classList.remove('hidden');
  });
}

async function saveNote() {
  const user = getCurrentUser();
  if (!user) { showToast('Inicia sesión', 'info'); return; }
  const text  = document.getElementById('note-textarea')?.value.trim();
  const emoji = document.getElementById('note-emoji-selected')?.textContent || '[msg]';
  const btn   = document.getElementById('save-note-btn');

  if (!text) { showToast('Escribe algo en tu nota', 'warning'); return; }
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    await updateDoc(doc(db, 'users', user.uid), {
      noteText:     text,
      noteEmoji:    emoji,
      noteUpdatedAt: serverTimestamp()
    });
    showToast('Nota publicada [pen]', 'success');
    await renderYourNote();
  } catch(e) {
    showToast('Error al guardar nota', 'error');
  } finally {
    btn.disabled = false; btn.textContent = '[pen] Publicar Nota';
  }
}

async function deleteNote() {
  const user = getCurrentUser();
  if (!user) return;
  try {
    await updateDoc(doc(db, 'users', user.uid), { noteText: '', noteEmoji: '', noteUpdatedAt: null });
    showToast('Nota eliminada', 'success');
    await renderYourNote();
  } catch(e) { showToast('Error al eliminar nota', 'error'); }
}

/* ── Following Notes Feed ── */
async function loadFollowingNotes() {
  const container = document.getElementById('notes-feed-grid');
  if (!container) return;
  container.innerHTML = '';

  try {
    const snap = await getDocs(query(collection(db, 'users'), limit(12)));
    const user = getCurrentUser();
    const users = snap.docs.map(d => ({ uid: d.id, ...d.data() }))
      .filter(u => u.uid !== user?.uid && u.noteText && !isExpired(u.noteUpdatedAt, 24));

    if (!users.length) {
      container.innerHTML = `
        <div class="notes-empty">
          <div class="icon">[pen]</div>
          <p>Las personas que sigues aún no han compartido notas.</p>
        </div>`;
      return;
    }

    container.innerHTML = users.map(u => `
      <div class="note-person-item" onclick="window.openNoteDetail('${u.uid}')">
        <div class="note-bubble-wrap">
          <div class="note-bubble">
            <span class="note-bubble-emoji">${u.noteEmoji || '[msg]'}</span>
            ${u.noteText.substring(0, MAX_NOTE_CHARS)}
          </div>
        </div>
        ${u.photoURL
          ? `<img class="note-person-avatar" src="${u.photoURL}" alt="${u.displayName}">`
          : `<div class="note-person-avatar avatar-placeholder" style="display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;background:var(--gradient-dim);color:var(--primary)">${(u.displayName||'?')[0]}</div>`}
        <div class="note-person-name">${u.displayName?.split(' ')[0] || 'User'}</div>
      </div>`).join('');
  } catch(e) {
    container.innerHTML = '<div class="notes-empty"><p>Error cargando notas</p></div>';
    console.error(e);
  }
}

/* ── Note Detail Modal ── */
window.openNoteDetail = async (uid) => {
  const snap = await getDoc(doc(db, 'users', uid));
  const u    = snap.data();
  if (!u) return;
  const modal = document.getElementById('note-detail-modal');
  if (!modal) return;

  const avatarEl  = document.getElementById('note-detail-avatar');
  const nameEl    = document.getElementById('note-detail-name');
  const emojiEl   = document.getElementById('note-detail-emoji');
  const textEl    = document.getElementById('note-detail-text');
  const timeEl    = document.getElementById('note-detail-time');

  if (avatarEl) {
    if (u.photoURL) { avatarEl.src = u.photoURL; avatarEl.style.display = 'block'; }
    else              avatarEl.style.display = 'none';
  }
  if (nameEl) nameEl.textContent  = u.displayName || 'Usuario';
  if (emojiEl) emojiEl.textContent = u.noteEmoji || '[msg]';
  if (textEl) textEl.textContent   = u.noteText || '';
  if (timeEl) timeEl.textContent   = expiresIn(u.noteUpdatedAt, 24);

  modal.classList.remove('hidden');

  // Reply
  document.getElementById('note-reply-send')?.addEventListener('click', async () => {
    const text = document.getElementById('note-reply-text')?.value.trim();
    if (!text) return;
    import('./messages.js').then(({ getOrCreateChat }) => {
      modal.classList.add('hidden');
      getOrCreateChat(uid);
    });
  }, { once: true });
};
