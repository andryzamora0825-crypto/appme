// =====================================================
// ZAMORA MSG — Messages Module
// =====================================================

import { db }             from './firebase-config.js';
import { getCurrentUser } from './auth.js';
import {
  collection, addDoc, doc, getDoc, getDocs,
  query, orderBy, limit, onSnapshot, serverTimestamp,
  where, updateDoc, arrayUnion, setDoc, getCountFromServer
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { showToast, getAvatarHTML } from './ui.js';
import { timeAgo, validateImageFile, compressImage, generateId, readFileAsDataURL } from './utils.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-storage.js";
import { storage } from './firebase-config.js';
import { loadStickerPicker } from './stickers.js';
import { loadStories } from './feed.js';

let activeChat     = null;
let msgListener    = null;
let chatListSub    = null;
let isMobile       = window.innerWidth < 768;

/* ── Init Messages ── */
export function initMessages() {
  isMobile = window.innerWidth < 768;
  loadChatList();
  loadOnlineFriends();
  loadStories();
  setupChatInput();
  setupStickerPicker();

  // Pending sticker from sticker page
  if (window._pendingSticker && activeChat) {
    sendSticker(window._pendingSticker);
    window._pendingSticker = null;
  }

  document.getElementById('new-chat-btn')?.addEventListener('click', openNewChat);
  window.addEventListener('resize', () => { isMobile = window.innerWidth < 768; });
}

/* ── Online Friends Grid ── */
async function loadOnlineFriends() {
  const user = getCurrentUser();
  if (!user) return;
  const listEl = document.getElementById('online-friends-list');
  if (!listEl) return;
  
  // First, add the "You" item
  const myNoteHtml = `
    <div class="note-person-item" onclick="promptNoteStatus()" style="width:75px;flex-shrink:0;cursor:pointer;position:relative;display:flex;flex-direction:column;align-items:center;">
       <div style="position:relative;margin-bottom:4px;margin-top:16px;">
           <div class="ig-note-bubble" style="color:var(--text-muted);font-size:1.2rem;padding:0px 8px;line-height:1.2;">+</div>
           ${getAvatarHTML(user, 'lg', 'note-person-avatar')}
       </div>
       <div class="note-person-name" style="font-size:0.75rem;max-width:75px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);">Tu nota</div>
    </div>`;

  const q = query(collection(db, 'users'), limit(20));
  onSnapshot(q, snap => {
    let html = myNoteHtml;
    snap.forEach(docSnap => {
      const u = docSnap.data();
      if (docSnap.id === user.uid) return; // Skip self
      if (!u.online && !u.noteText) return; // Only show if online or has note
      
      const IGNote = u.noteText ? `<div class="ig-note-bubble">${u.noteText}</div>` : '';
      const onlineDot = u.online ? `<div class="chat-item-online-dot" style="width:14px;height:14px;bottom:2px;right:2px"></div>` : '';

      html += `
        <div class="note-person-item" onclick="window.openChatWith('${docSnap.id}')" style="width:75px;flex-shrink:0;cursor:pointer;position:relative;display:flex;flex-direction:column;align-items:center;">
          <div style="position:relative;margin-bottom:4px;margin-top:16px;">
            ${IGNote}
            ${getAvatarHTML(u, 'lg', 'note-person-avatar')}
            ${onlineDot}
          </div>
          <div class="note-person-name" style="font-size:0.75rem;max-width:75px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${u.displayName?.split(' ')[0] || 'User'}</div>
        </div>`;
    });
    listEl.innerHTML = html;
  });
}

window.promptNoteStatus = async () => {
    const { createModal, openModal, closeModal, showToast } = await import('./ui.js');
    const modalId = 'ig-note-modal';
    if (!document.getElementById(modalId)) {
      createModal({
        id: modalId,
        title: 'Crear publicación',
        content: `
          <div style="display:flex; flex-direction:column; gap:12px; padding: 12px 0;">
            <button class="btn btn-primary" onclick="window.submitIgNote()">[msg] Dejar una Nota (Burbuja)</button>
            <button class="btn btn-secondary" onclick="window.closeModalById('${modalId}'); window.openUploadStory()">[cam] Subir Estado de 24h</button>
          </div>
        `,
        size: 'sm'
      });
    }
    
    window.submitIgNote = async () => {
      const text = prompt("Escribe una nota corta (ej. 'Feliz lunes!'):");
      if (text !== null) {
        const user = getCurrentUser();
        if (!user) return;
        try {
          await updateDoc(doc(db, 'users', user.uid), { noteText: text.substring(0, 60) });
          showToast('Nota publicada en tu burbuja', 'success');
          closeModal(modalId);
        } catch(e) { console.error(e); }
      }
    };

    openModal(modalId);
};

/* ── Chat List ── */
async function loadChatList() {
  const user = getCurrentUser();
  if (!user) return;
  const listEl = document.getElementById('chat-list');
  if (!listEl) return;

  listEl.innerHTML = '';

  const q = query(
    collection(db, 'chats'),
    where('participants', 'array-contains', user.uid),
    orderBy('lastMessageAt', 'desc'),
    limit(50)
  );

  if (chatListSub) chatListSub();
  chatListSub = onSnapshot(q, async (snap) => {
    if (snap.empty) {
      listEl.innerHTML = `<div class="empty-state" style="padding:32px"><div style="font-size:3rem">[msg]</div><p style="color:var(--text-muted);font-size:0.88rem;text-align:center;margin-top:8px">Sin conversaciones.<br>¡Inicia una nueva!</p></div>`;
      return;
    }
    const chats = [];
    for (const d of snap.docs) {
      const chat   = { id: d.id, ...d.data() };
      const otherId= chat.participants.find(p => p !== user.uid);
      const other  = otherId ? await getUserCached(otherId) : { displayName: 'Grupo', photoURL: '' };
      chats.push({ chat, other });
    }
    listEl.innerHTML = chats.map(({ chat, other }) => renderChatItem(chat, other, user.uid)).join('');

    // Bind click
    listEl.querySelectorAll('.chat-item').forEach(item => {
      item.addEventListener('click', () => {
        const chatId = item.dataset.chatId;
        const uid    = item.dataset.uid;
        openChat(chatId, uid);
      });
    });
  });
}

function renderChatItem(chat, other, myUid) {
  const isOnline  = other.online;
  const unread    = chat.unreadCount?.[myUid] || 0;
  const lastMsg   = chat.lastMessage || '';
  const lastTime  = chat.lastMessageAt ? timeAgo(chat.lastMessageAt) : '';
  return `
  <div class="chat-item ${activeChat === chat.id ? 'active' : ''}" data-chat-id="${chat.id}" data-uid="${chat.participants.find(p=>p!==myUid)}">
    <div class="chat-item-avatar-wrap">
      ${other.photoURL ? `<img src="${other.photoURL}" class="avatar avatar-md" alt="">` : `<div class="avatar avatar-md avatar-placeholder">${(other.displayName||'?')[0]}</div>`}
      ${isOnline ? '<div class="chat-item-online-dot"></div>' : ''}
    </div>
    <div class="chat-item-info">
      <div class="chat-item-name">${other.displayName || 'Usuario'}</div>
      <div class="chat-item-last-msg ${unread ? 'unread' : ''}">${lastMsg.substring(0,60) || 'Sin mensajes'}</div>
    </div>
    <div class="chat-item-meta">
      <div class="chat-item-time">${lastTime}</div>
      ${unread ? `<div class="chat-item-unread">${unread > 99 ? '99+' : unread}</div>` : ''}
    </div>
  </div>`;
}

/* ── Open Chat ── */
async function openChat(chatId, otherId) {
  activeChat = chatId;
  const user   = getCurrentUser();
  const other  = await getUserCached(otherId);

  // Mobile: show chat window
  if (isMobile) {
    document.querySelector('.chat-list-panel').classList.add('chat-open');
    document.querySelector('.chat-window').classList.add('chat-open');
  }

  // Header
  const nameEl   = document.getElementById('chat-partner-name');
  const statusEl = document.getElementById('chat-partner-status');
  const avatarEl = document.getElementById('chat-partner-avatar');
  if (nameEl)   nameEl.textContent   = other.displayName || 'Usuario';
  if (statusEl) { statusEl.textContent = other.online ? 'En línea' : `Visto ${timeAgo(other.lastSeen)}`; statusEl.className = `chat-header-status ${other.online ? 'online' : ''}`; }
  if (avatarEl) { avatarEl.src = other.photoURL || ''; avatarEl.style.display = other.photoURL ? '' : 'none'; }

  // Show chat content, hide empty state
  document.getElementById('chat-empty-state')?.classList.add('hidden');
  document.getElementById('chat-content')?.classList.remove('hidden');

  // Clear unread
  if (user && chatId) {
    try { await updateDoc(doc(db, 'chats', chatId), { [`unreadCount.${user.uid}`]: 0 }); } catch {}
  }

  // Load messages
  loadMessages(chatId, user.uid);

  // Highlight active chat
  document.querySelectorAll('.chat-item').forEach(el => {
    el.classList.toggle('active', el.dataset.chatId === chatId);
  });
}

/* ── Load Messages ── */
function loadMessages(chatId, myUid) {
  const area = document.getElementById('messages-area');
  if (!area) return;
  area.innerHTML = '';

  const q = query(collection(db,'chats',chatId,'messages'), orderBy('createdAt','asc'), limit(100));
  if (msgListener) msgListener();
  msgListener = onSnapshot(q, async (snap) => {
    const messages = [];
    for (const d of snap.docs) {
      const m = { id: d.id, ...d.data() };
      const authorData = await getUserCached(m.senderId);
      messages.push({ m, authorData });
    }
    renderMessages(messages, myUid, area);
    area.scrollTop = area.scrollHeight;
  });
}

function renderMessages(messages, myUid, area) {
  if (!messages.length) {
    area.innerHTML = '<div class="empty-state" style="height:100%"><div class="empty-state-icon">[msg]</div><p>No hay mensajes aún.<br>¡Di hola!</p></div>';
    return;
  }

  let html = '';
  let prevDate = '';

  messages.forEach(({ m, authorData }) => {
    const isSent = m.senderId === myUid;
    const dateStr = m.createdAt?.toDate ? m.createdAt.toDate().toLocaleDateString('es-MX', {weekday:'short',month:'short',day:'numeric'}) : '';
    if (dateStr && dateStr !== prevDate) {
      html += `<div class="msg-date-sep">${dateStr}</div>`;
      prevDate = dateStr;
    }
    html += renderBubble(m, isSent, authorData);
  });
  area.innerHTML = html;

  // Bind view-once reveals
  area.querySelectorAll('.bubble-view-once:not(.opened)').forEach(el => {
    el.addEventListener('click', () => revealViewOnceMsg(el), { once: true });
  });
}

function renderBubble(msg, isSent, author) {
  const time  = timeAgo(msg.createdAt);
  const ticks = isSent ? `<span class="msg-read-tick ${msg.read ? 'read' : ''}">
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
  </span>` : '';

  let bubbleContent = '';
  if (msg.type === 'sticker') {
    bubbleContent = `<div class="bubble bubble-sticker"><img src="${msg.stickerURL}" alt="sticker"></div>`;
  } else if (msg.type === 'image') {
    bubbleContent = `<div class="bubble bubble-image ${isSent ? 'bubble-sent' : 'bubble-received'}">
      <img src="${msg.imageURL}" alt="imagen" onclick="openImageLightbox('${msg.imageURL}')">
    </div>`;
  } else if (msg.viewOnce && !isSent) {
    const opened = msg.viewedBy?.includes(msg.senderId) && msg.viewedBy?.includes(msg.recipientId);
    bubbleContent = `<div class="bubble-view-once ${opened ? 'opened' : ''}" data-msg-id="${msg.id}">
      <span class="view-once-icon">[cam]</span>
      <div><div class="view-once-label">${opened ? 'Ya vista' : 'Foto: ver una sola vez'}</div>
      <div class="view-once-sub">${opened ? '' : 'Toca para abrir'}</div></div>
    </div>`;
  } else {
    bubbleContent = `<div class="bubble ${isSent ? 'bubble-sent' : 'bubble-received'}">${escapeHtml(msg.content || '')}</div>`;
  }

  const avatarHTML = !isSent && author?.photoURL
    ? `<img class="msg-avatar" src="${author.photoURL}" alt="">`
    : !isSent ? `<div class="msg-avatar avatar-placeholder" style="display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;background:var(--gradient-dim);color:var(--primary)">${(author?.displayName||'?')[0]}</div>` : '';

  return `
  <div class="message-row ${isSent ? 'sent' : 'received'}" data-msg-id="${msg.id}">
    ${avatarHTML}
    <div class="bubble-group">
      ${bubbleContent}
      <div class="msg-time">${time}${ticks}</div>
    </div>
  </div>`;
}

function revealViewOnceMsg(el) {
  el.classList.add('opened');
  el.innerHTML = `<span style="font-size:1.5rem">[L]</span><div><div class="view-once-label" style="color:var(--text-muted)">Ya vista</div></div>`;
}

/* ── Send Message ── */
async function sendMessage(chatId, content, options = {}) {
  const user = getCurrentUser();
  if (!user) return;

  const msgData = {
    senderId:  user.uid,
    content:   content || '',
    type:      options.type  || 'text',
    viewOnce:  options.viewOnce || false,
    viewedBy:  [],
    read:      false,
    createdAt: serverTimestamp(),
    ...options
  };
  delete msgData.type_override;

  try {
    const chatRef = doc(db, 'chats', chatId);
    await addDoc(collection(db, 'chats', chatId, 'messages'), msgData);
    await updateDoc(chatRef, {
      lastMessage:   options.type === 'sticker' ? '[art] Sticker' : options.type === 'image' ? '[cam] Imagen' : content,
      lastMessageAt: serverTimestamp()
    });
    window.playSFX('send'); // Play send SFX
  } catch(e) { showToast('Error enviando mensaje', 'error'); console.error(e); }
}

/* ── Chat Input Setup ── */
function setupChatInput() {
  const input   = document.getElementById('chat-text-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const imgBtn  = document.getElementById('chat-image-btn');
  const imgInput= document.getElementById('chat-image-input');

  sendBtn?.addEventListener('click', handleSendText);
  input  ?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); }
  });
  input?.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; });

  imgBtn?.addEventListener('click', () => imgInput?.click());
  imgInput?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await handleSendImage(file);
    imgInput.value = '';
  });

  // Back button (mobile)
  document.getElementById('chat-back-btn')?.addEventListener('click', () => {
    activeChat = null;
    document.querySelector('.chat-list-panel').classList.remove('chat-open');
    document.querySelector('.chat-window').classList.remove('chat-open');
    if (msgListener) msgListener();
  });

  // View partner profile
  document.getElementById('chat-partner-name')?.addEventListener('click', () => {
    const otherId = document.querySelector('.chat-item.active')?.dataset.uid;
    if (otherId) import('./router.js').then(({ router }) => router.navigate('profile', { uid: otherId }));
  });
}

async function handleSendText() {
  if (!activeChat) { showToast('Selecciona una conversación', 'info'); return; }
  const input   = document.getElementById('chat-text-input');
  const content = input?.value.trim();
  if (!content) return;
  input.value = ''; input.style.height = 'auto';
  await sendMessage(activeChat, content);
}

async function handleSendImage(file) {
  if (!activeChat) return;
  const err = validateImageFile(file);
  if (err) { showToast(err, 'error'); return; }
  const viewOnce = document.getElementById('chat-view-once-toggle')?.classList.contains('on');
  showToast('Enviando imagen...', 'info', 1500);
  const compressed = await compressImage(file, 800, 0.85);
  const storRef    = ref(storage, `messages/${activeChat}/${generateId('img')}`);
  await uploadBytes(storRef, compressed);
  const imageURL   = await getDownloadURL(storRef);
  await sendMessage(activeChat, '', { type: 'image', imageURL, viewOnce });
}

async function sendSticker(stickerData) {
  if (!activeChat) { showToast('Selecciona un chat primero', 'info'); return; }
  await sendMessage(activeChat, '', {
    type: 'sticker', stickerURL: stickerData.imageURL, stickerId: stickerData.stickerId
  });
}

/* ── Sticker Picker ── */
function setupStickerPicker() {
  const btn     = document.getElementById('chat-sticker-btn');
  const popup   = document.getElementById('sticker-picker-popup');
  const search  = document.getElementById('sticker-picker-search');
  const gridId  = 'sticker-picker-grid';

  btn?.addEventListener('click', () => {
    const isHidden = popup?.classList.contains('hidden');
    popup?.classList.toggle('hidden', !isHidden);
    if (isHidden) loadStickerPicker(gridId);
  });

  // Set the pick handler
  window._onStickerPick = async (id, url, name) => {
    popup?.classList.add('hidden');
    if (!activeChat) { showToast('Selecciona un chat', 'info'); return; }
    await sendMessage(activeChat, '', { type: 'sticker', stickerURL: url, stickerId: id });
  };

  document.addEventListener('click', (e) => {
    if (!btn?.contains(e.target) && !popup?.contains(e.target)) popup?.classList.add('hidden');
  });
}

/* ── Get or Create Chat ── */
export async function getOrCreateChat(otherUid) {
  const user = getCurrentUser();
  if (!user) return null;
  const myUid = user.uid;
  const chatId = [myUid, otherUid].sort().join('_');
  const chatRef = doc(db, 'chats', chatId);
  try {
    const snap = await getDoc(chatRef);
    if (!snap.exists()) {
      await setDoc(chatRef, {
        participants:  [myUid, otherUid],
        lastMessage:   '',
        lastMessageAt: serverTimestamp(),
        unreadCount:   { [myUid]: 0, [otherUid]: 0 }
      });
    }
    openChat(chatId, otherUid);
    return chatId;
  } catch(e) { showToast('Error al abrir chat', 'error'); return null; }
}
window.openChatWith = getOrCreateChat;

/* ── New Chat Modal ── */
async function openNewChat() {
  const { openModal } = await import('./ui.js');
  document.getElementById('new-chat-modal')?.classList.remove('hidden');
  loadUserSearch();
}

async function loadUserSearch() {
  const input = document.getElementById('new-chat-search');
  const list  = document.getElementById('new-chat-user-list');
  if (!input || !list) return;

  const search = async () => {
    const term = input.value.trim().toLowerCase();
    const user = getCurrentUser();
    list.innerHTML = '';
    const snap = await getDocs(query(collection(db,'users'), limit(8)));
    const users = snap.docs.map(d => ({ uid: d.id, ...d.data() }))
      .filter(u => u.uid !== user?.uid && (!term || u.displayName?.toLowerCase().includes(term) || u.username?.toLowerCase().includes(term)));
    list.innerHTML = users.slice(0,8).map(u => `
      <div class="suggested-user" style="cursor:pointer" onclick="window.createChatWith('${u.uid}')">
        ${u.photoURL ? `<img src="${u.photoURL}" class="avatar avatar-sm" alt="">` : `<div class="avatar avatar-sm avatar-placeholder">${(u.displayName||'?')[0]}</div>`}
        <div class="suggested-user-info">
          <div class="suggested-user-name">${u.displayName}</div>
          <div class="suggested-user-bio">@${u.username || ''}</div>
        </div>
      </div>`).join('') || '<p style="color:var(--text-muted);padding:16px;font-size:0.88rem">No se encontraron usuarios</p>';
  };

  input.addEventListener('input', debounce(search, 300));
  search();
}

window.createChatWith = async (uid) => {
  document.getElementById('new-chat-modal')?.classList.add('hidden');
  import('./router.js').then(() => getOrCreateChat(uid));
};

/* ── Helpers ── */
const userCache2 = {};
async function getUserCached(uid) {
  if (userCache2[uid]) return userCache2[uid];
  const d = await getDoc(doc(db, 'users', uid));
  userCache2[uid] = d.exists() ? d.data() : { displayName: 'Usuario', photoURL: '' };
  return userCache2[uid];
}

function escapeHtml(text) {
  const m = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' };
  return text.replace(/[&<>"']/g, c => m[c]);
}

function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }
