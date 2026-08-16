// app.js — frontend logic. Talks to the backend over a small REST API
// (GET/POST/DELETE /api/letters) instead of storing anything locally.

const grid = document.getElementById('lettersGrid');
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const emptyState = document.getElementById('emptyState');
const countLabel = document.getElementById('countLabel');

const composeOverlay = document.getElementById('composeOverlay');
const composeForm = document.getElementById('composeForm');
const titleInput = document.getElementById('titleInput');
const fromInput = document.getElementById('fromInput');
const dateInput = document.getElementById('dateInput');
const messageInput = document.getElementById('messageInput');
const photoInput = document.getElementById('photoInput');
const photoPreviewWrap = document.getElementById('photoPreviewWrap');
const photoPreview = document.getElementById('photoPreview');
const removePhotoBtn = document.getElementById('removePhoto');
const formError = document.getElementById('formError');
const saveBtn = document.getElementById('saveBtn');

const viewOverlay = document.getElementById('viewOverlay');
const viewContent = document.getElementById('viewContent');

let pendingPhotoDataUrl = null;
let letters = [];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  if (isNaN(d)) return str;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- API calls ----------
async function apiListLetters() {
  const res = await fetch('/api/letters');
  if (!res.ok) throw new Error('Failed to load letters');
  return res.json();
}

async function apiCreateLetter(payload) {
  const res = await fetch('/api/letters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to save letter');
  return data;
}

async function apiDeleteLetter(id) {
  const res = await fetch('/api/letters/' + id, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete letter');
}

// ---------- load & render ----------
async function loadAll() {
  loadingState.hidden = false;
  errorState.hidden = true;
  emptyState.hidden = true;
  grid.hidden = true;

  try {
    letters = await apiListLetters();
    loadingState.hidden = true;
    grid.hidden = false;
    render();
  } catch (err) {
    loadingState.hidden = true;
    errorState.hidden = false;
  }
}

function render() {
  grid.innerHTML = '';
  countLabel.textContent = letters.length
    ? letters.length + (letters.length === 1 ? ' letter tucked inside' : ' letters tucked inside')
    : '';

  if (letters.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  letters.forEach((letter) => {
    const card = document.createElement('div');
    card.className = 'envelope';
    card.innerHTML = `
      <div class="seal">❤</div>
      <div class="env-title">${escapeHtml(letter.title)}</div>
      <div class="env-date">${fmtDate(letter.date)}</div>
      ${letter.photo ? `<img class="env-thumb" src="${letter.photo}" alt="">` : ''}
      <button type="button" class="del-btn" title="Delete this letter">✕ remove</button>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.del-btn')) return;
      openView(letter);
    });
    card.querySelector('.del-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Remove "${letter.title}" from the folder? This can't be undone.`)) return;
      try {
        await apiDeleteLetter(letter.id);
        await loadAll();
      } catch {
        alert('Could not delete that letter. Please try again.');
      }
    });
    grid.appendChild(card);
  });
}

// ---------- view modal ----------
function openView(letter) {
  viewContent.innerHTML = `
    <div class="view-title">${escapeHtml(letter.title)}</div>
    <div class="view-meta">${fmtDate(letter.date)}</div>
    ${letter.photo ? `<img class="view-photo" src="${letter.photo}" alt="">` : ''}
    <div class="view-message">${escapeHtml(letter.message)}</div>
    ${letter.from ? `<div class="view-from">— ${escapeHtml(letter.from)}</div>` : ''}
  `;
  viewOverlay.hidden = false;
}
document.getElementById('closeView').addEventListener('click', () => (viewOverlay.hidden = true));
viewOverlay.addEventListener('click', (e) => { if (e.target === viewOverlay) viewOverlay.hidden = true; });

// ---------- compose modal ----------
function openCompose() {
  composeForm.reset();
  dateInput.value = todayStr();
  pendingPhotoDataUrl = null;
  photoPreviewWrap.hidden = true;
  formError.hidden = true;
  composeOverlay.hidden = false;
  setTimeout(() => titleInput.focus(), 50);
}
function closeCompose() {
  composeOverlay.hidden = true;
}

document.getElementById('newLetterBtn').addEventListener('click', openCompose);
document.getElementById('closeCompose').addEventListener('click', closeCompose);
composeOverlay.addEventListener('click', (e) => { if (e.target === composeOverlay) closeCompose(); });

// compress + preview photo before it ever leaves the browser
photoInput.addEventListener('change', () => {
  const file = photoInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 900;
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      pendingPhotoDataUrl = canvas.toDataURL('image/jpeg', 0.82);
      photoPreview.src = pendingPhotoDataUrl;
      photoPreviewWrap.hidden = false;
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

removePhotoBtn.addEventListener('click', () => {
  pendingPhotoDataUrl = null;
  photoInput.value = '';
  photoPreviewWrap.hidden = true;
});

composeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.hidden = true;

  const title = titleInput.value.trim();
  const message = messageInput.value.trim();
  if (!title || !message) {
    formError.textContent = 'Please add a title and your message before saving.';
    formError.hidden = false;
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    await apiCreateLetter({
      title,
      from: fromInput.value.trim(),
      date: dateInput.value || todayStr(),
      message,
      photo: pendingPhotoDataUrl,
    });
    closeCompose();
    await loadAll();
  } catch (err) {
    formError.textContent = err.message || 'Something went wrong saving your letter. Please try again.';
    formError.hidden = false;
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Seal & Save 💌';
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!viewOverlay.hidden) viewOverlay.hidden = true;
    if (!composeOverlay.hidden) closeCompose();
  }
});

loadAll();
