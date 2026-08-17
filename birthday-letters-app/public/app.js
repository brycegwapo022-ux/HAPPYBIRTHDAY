// app.js — frontend logic. Talks to the backend over a small REST API
// for letters (GET/POST/DELETE /api/letters) and folders (GET/POST/DELETE /api/folders).

const grid = document.getElementById('lettersGrid');
const loadingState = document.getElementById('loadingState');
const errorState = document.getElementById('errorState');
const emptyState = document.getElementById('emptyState');
const emptyStateSub = document.getElementById('emptyStateSub');
const countLabel = document.getElementById('countLabel');
const looseLabel = document.getElementById('looseLabel');
const foldersSection = document.getElementById('foldersSection');
const foldersGrid = document.getElementById('foldersGrid');
const folderHeader = document.getElementById('folderHeader');
const folderHeaderTitle = document.getElementById('folderHeaderTitle');
const backToHomeBtn = document.getElementById('backToHomeBtn');

const composeOverlay = document.getElementById('composeOverlay');
const composeForm = document.getElementById('composeForm');
const folderSelect = document.getElementById('folderSelect');
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

const folderOverlay = document.getElementById('folderOverlay');
const folderForm = document.getElementById('folderForm');
const folderNameInput = document.getElementById('folderNameInput');
const colorSwatches = document.getElementById('colorSwatches');
const folderFormError = document.getElementById('folderFormError');

const FOLDER_COLORS = ['#F3D6D9', '#F6E4C8', '#D9E8D3', '#D9E0F3', '#EAD3F0'];

let pendingPhotoDataUrl = null;
let letters = [];
let folders = [];
let selectedFolderColor = FOLDER_COLORS[0];

// currentFolderId: null = home (folders + loose letters), otherwise a folder's id
let currentFolderId = null;

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
async function apiListLetters(folderParam) {
  const qs = folderParam ? '?folder=' + encodeURIComponent(folderParam) : '';
  const res = await fetch('/api/letters' + qs);
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

async function apiListFolders() {
  const res = await fetch('/api/folders');
  if (!res.ok) throw new Error('Failed to load folders');
  return res.json();
}

async function apiCreateFolder(payload) {
  const res = await fetch('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to create folder');
  return data;
}

async function apiDeleteFolder(id) {
  const res = await fetch('/api/folders/' + id, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete folder');
}

// ---------- load & render ----------
async function loadAll() {
  loadingState.hidden = false;
  errorState.hidden = true;
  emptyState.hidden = true;
  grid.hidden = true;
  foldersSection.hidden = true;

  try {
    if (currentFolderId === null) {
      // home view: folders + loose letters
      [folders, letters] = await Promise.all([apiListFolders(), apiListLetters('none')]);
    } else {
      // inside a specific folder
      folders = [];
      letters = await apiListLetters(currentFolderId);
    }
    loadingState.hidden = true;
    grid.hidden = false;
    renderFolderHeader();
    renderFolders();
    renderLetters();
    populateFolderSelect();
  } catch (err) {
    loadingState.hidden = true;
    errorState.hidden = false;
  }
}

function renderFolderHeader() {
  if (currentFolderId === null) {
    folderHeader.hidden = true;
    foldersSection.hidden = false;
    looseLabel.hidden = folders.length === 0; // only show the label if there's context to distinguish
    return;
  }
  foldersSection.hidden = true;
  looseLabel.hidden = true;
  folderHeader.hidden = false;
  const current = folders.find((f) => f.id === currentFolderId);
  folderHeaderTitle.textContent = current ? current.name : 'Folder';
}

function renderFolders() {
  foldersGrid.innerHTML = '';
  if (currentFolderId !== null) return;

  folders.forEach((folder) => {
    const card = document.createElement('div');
    card.className = 'folder-card';
    card.style.setProperty('--folder-color', folder.color || FOLDER_COLORS[0]);
    card.innerHTML = `
      <div class="folder-name">${escapeHtml(folder.name)}</div>
      <div class="folder-count">${folder.letterCount || 0} letter${folder.letterCount === 1 ? '' : 's'}</div>
      <button type="button" class="folder-del-btn" title="Delete this folder">✕ remove</button>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.folder-del-btn')) return;
      currentFolderId = folder.id;
      loadAll();
    });
    card.querySelector('.folder-del-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete the "${folder.name}" folder? Its letters will move to "loose letters" instead of being deleted.`)) return;
      try {
        await apiDeleteFolder(folder.id);
        await loadAll();
      } catch {
        alert('Could not delete that folder. Please try again.');
      }
    });
    foldersGrid.appendChild(card);
  });
}

function renderLetters() {
  grid.innerHTML = '';
  countLabel.textContent = letters.length
    ? letters.length + (letters.length === 1 ? ' letter tucked inside' : ' letters tucked inside')
    : '';

  if (letters.length === 0 && (currentFolderId !== null || folders.length === 0)) {
    emptyState.hidden = false;
    emptyStateSub.textContent = currentFolderId !== null
      ? "this folder is empty — write a letter into it 💌"
      : "your folder is empty — go on, write one 💌";
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

function populateFolderSelect() {
  folderSelect.innerHTML = '<option value="">No folder (loose letter)</option>';
  const allFolders = folders.length ? folders : [];
  // when we're viewing inside a folder, `folders` is empty (see loadAll),
  // so make sure the select still has at least the current folder as an option
  const optionsSource = currentFolderId !== null && !allFolders.length
    ? [{ id: currentFolderId, name: folderHeaderTitle.textContent }]
    : allFolders;

  optionsSource.forEach((f) => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    folderSelect.appendChild(opt);
  });
  folderSelect.value = currentFolderId || '';
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

// ---------- navigation ----------
backToHomeBtn.addEventListener('click', () => {
  currentFolderId = null;
  loadAll();
});

// ---------- compose modal ----------
function openCompose() {
  composeForm.reset();
  dateInput.value = todayStr();
  pendingPhotoDataUrl = null;
  photoPreviewWrap.hidden = true;
  formError.hidden = true;
  populateFolderSelect();
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
      folderId: folderSelect.value || null,
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

// ---------- new folder modal ----------
function buildColorSwatches() {
  colorSwatches.innerHTML = '';
  FOLDER_COLORS.forEach((color, i) => {
    const sw = document.createElement('div');
    sw.className = 'swatch' + (i === 0 ? ' selected' : '');
    sw.style.background = color;
    sw.addEventListener('click', () => {
      selectedFolderColor = color;
      [...colorSwatches.children].forEach((c) => c.classList.remove('selected'));
      sw.classList.add('selected');
    });
    colorSwatches.appendChild(sw);
  });
}
buildColorSwatches();

function openFolderModal() {
  folderForm.reset();
  folderFormError.hidden = true;
  selectedFolderColor = FOLDER_COLORS[0];
  buildColorSwatches();
  folderOverlay.hidden = false;
  setTimeout(() => folderNameInput.focus(), 50);
}
function closeFolderModal() {
  folderOverlay.hidden = true;
}

document.getElementById('newFolderBtn').addEventListener('click', openFolderModal);
document.getElementById('closeFolderModal').addEventListener('click', closeFolderModal);
folderOverlay.addEventListener('click', (e) => { if (e.target === folderOverlay) closeFolderModal(); });

folderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  folderFormError.hidden = true;
  const name = folderNameInput.value.trim();
  if (!name) {
    folderFormError.textContent = 'Please give the folder a name.';
    folderFormError.hidden = false;
    return;
  }
  try {
    await apiCreateFolder({ name, color: selectedFolderColor });
    closeFolderModal();
    await loadAll();
  } catch (err) {
    folderFormError.textContent = err.message || 'Something went wrong creating the folder.';
    folderFormError.hidden = false;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!viewOverlay.hidden) viewOverlay.hidden = true;
    if (!composeOverlay.hidden) closeCompose();
    if (!folderOverlay.hidden) closeFolderModal();
  }
});

loadAll();
