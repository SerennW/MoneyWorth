/* ── Auth token storage ── */
const TOKEN_KEY = 'mw_token';
const USER_KEY  = 'mw_user';

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}
function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
    return JSON.parse(raw || 'null');
  } catch { return null; }
}
function saveAuth(token, user, remember = true) {
  const store = remember ? localStorage : sessionStorage;
  store.setItem(TOKEN_KEY, token);
  store.setItem(USER_KEY, JSON.stringify(user));
}
function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

/* ── State ── */
let currentUser  = getUser();
let posts        = [];
let pending      = [];
let pendingTags  = [];
let sort         = 'new';
let filterMine   = false;
let activePostId = null;

/* ── API helpers ── */
async function apiFetch(url, options = {}) {
  const token = getToken();
  if (token) {
    options.headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
  }
  const res = await fetch(url, options);
  if (res.status === 401) {
    clearAuth();
    currentUser = null;
    renderHeader();
    const err = await res.json().catch(() => ({ error: 'Session expired' }));
    throw new Error(err.error || 'Session expired. Please log in again.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

/* ── Load posts ── */
async function loadPosts() {
  try {
    const data = await apiFetch('/api/posts');
    posts = data.map(p => ({ ...p, imgIdx: 0, vote: p.myVote || null }));
    render();
  } catch (e) {
    document.getElementById('feed').innerHTML = `
      <div class="empty">
        <div class="empty-icon">⚠️</div>
        <h3>Could not load posts</h3>
        <p>${e.message}</p>
      </div>`;
  }
}

/* ── Header ── */
function renderHeader() {
  const el      = document.getElementById('headerActions');
  const mineBtn = document.getElementById('myPostsBtn');
  const fab     = document.getElementById('fabNewPost');
  if (currentUser) {
    el.innerHTML = `
      <span class="header-user">@${esc(currentUser.username)}</span>
      <div class="user-menu-wrap">
        <button class="gear-btn" onclick="toggleUserMenu(event)" aria-label="Account settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
        <div class="user-menu" id="userMenu">
          <button class="user-menu-item" onclick="closeUserMenu(); logout()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Logout
          </button>
          <div class="user-menu-divider"></div>
          <button class="user-menu-item danger" onclick="closeUserMenu(); openDeleteAccount()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
              <line x1="17" y1="11" x2="22" y2="16"/>
              <line x1="22" y1="11" x2="17" y2="16"/>
            </svg>
            Delete Account
          </button>
        </div>
      </div>`;
    if (mineBtn) mineBtn.style.display = 'inline-flex';
    if (fab)     fab.style.display = 'flex';
  } else {
    el.innerHTML = `
      <button class="btn-ghost" onclick="openLogin()">Login</button>
      <button class="btn-primary" onclick="openRegister()">Register</button>`;
    if (mineBtn) mineBtn.style.display = 'none';
    if (fab)     fab.style.display = 'none';
  }
}

/* ── User menu (gear dropdown) ── */
function toggleUserMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('userMenu');
  if (!menu) return;
  const opening = !menu.classList.contains('open');
  menu.classList.toggle('open', opening);
  if (opening) {
    document.addEventListener('click', closeUserMenuOutside);
  }
}
function closeUserMenuOutside(e) {
  const wrap = document.querySelector('.user-menu-wrap');
  if (wrap && wrap.contains(e.target)) return;
  closeUserMenu();
}
function closeUserMenu() {
  const menu = document.getElementById('userMenu');
  if (menu) menu.classList.remove('open');
  document.removeEventListener('click', closeUserMenuOutside);
}

/* ── Delete account modal ── */
function openDeleteAccount() {
  document.getElementById('deleteAccountOverlay').classList.add('open');
  document.getElementById('daPassword').focus();
}
function closeDeleteAccount() {
  document.getElementById('deleteAccountOverlay').classList.remove('open');
  document.getElementById('deleteAccountForm').reset();
  clearFieldError('daPasswordError');
  setAuthError('deleteAccountError', '');
  const btn = document.getElementById('deleteAccountBtn');
  if (btn) { btn.disabled = false; btn.textContent = 'Delete My Account'; }
}
function onDeleteAccountOverlayClick(e) {
  if (e.target === e.currentTarget) closeDeleteAccount();
}
async function submitDeleteAccount(e) {
  e.preventDefault();
  const password = document.getElementById('daPassword').value;
  clearFieldError('daPasswordError');
  setAuthError('deleteAccountError', '');

  if (!password) {
    setFieldError('daPasswordError', 'Password is required.');
    document.getElementById('daPassword').focus();
    return;
  }

  const btn = document.getElementById('deleteAccountBtn');
  btn.disabled = true;
  btn.textContent = 'Deleting…';
  try {
    await apiFetch('/api/auth/me', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password })
    });
    clearAuth();
    currentUser = null;
    filterMine  = false;
    posts.forEach(p => { p.vote = null; });
    closeDeleteAccount();
    renderHeader();
    loadPosts();
  } catch (err) {
    setAuthError('deleteAccountError', err.message);
    btn.disabled = false;
    btn.textContent = 'Delete My Account';
  }
}

/* ── Auth: login modal ── */
function openLogin() {
  document.getElementById('loginOverlay').classList.add('open');
  document.getElementById('lIdentifier').focus();
}
function closeLogin() {
  document.getElementById('loginOverlay').classList.remove('open');
  document.getElementById('loginForm').reset();
  setAuthError('loginError', '');
  setAuthLoading('loginBtn', false, 'Login');
}
function onLoginOverlayClick(e) {
  if (e.target === e.currentTarget) closeLogin();
}
function switchToLogin() {
  closeRegister();
  openLogin();
}

async function submitLogin(e) {
  e.preventDefault();
  const identifier = document.getElementById('lIdentifier').value.trim();
  const password   = document.getElementById('lPassword').value;
  const remember   = document.getElementById('lRemember').checked;
  setAuthError('loginError', '');
  setAuthLoading('loginBtn', true, 'Logging in…');
  try {
    const { token, user } = await apiFetch('/api/auth/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ identifier, password })
    });
    saveAuth(token, user, remember);
    currentUser = user;
    closeLogin();
    renderHeader();
    loadPosts();
  } catch (err) {
    setAuthError('loginError', err.message);
    setAuthLoading('loginBtn', false, 'Login');
  }
}

/* ── Auth: register modal ── */
function openRegister() {
  document.getElementById('registerOverlay').classList.add('open');
  document.getElementById('rEmail').focus();
}
function closeRegister() {
  document.getElementById('registerOverlay').classList.remove('open');
  document.getElementById('registerForm').reset();
  clearRegisterErrors();
  setAuthLoading('registerBtn', false, 'Create Account');
}
function onRegisterOverlayClick(e) {
  if (e.target === e.currentTarget) closeRegister();
}
function switchToRegister() {
  closeLogin();
  openRegister();
}

async function submitRegister(e) {
  e.preventDefault();
  const email    = document.getElementById('rEmail').value.trim();
  const username = document.getElementById('rUsername').value.trim();
  const password = document.getElementById('rPassword').value;
  const confirm  = document.getElementById('rConfirm').value;

  clearRegisterErrors();
  let firstError = null;

  if (!email) {
    setFieldError('rEmailError', 'Email is required.');
    firstError = firstError || 'rEmail';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setFieldError('rEmailError', 'Enter a valid email address.');
    firstError = firstError || 'rEmail';
  }

  if (!username) {
    setFieldError('rUsernameError', 'Username is required.');
    firstError = firstError || 'rUsername';
  } else if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    setFieldError('rUsernameError', 'Username must be 3–20 characters (letters, numbers, underscore only).');
    firstError = firstError || 'rUsername';
  }

  if (!password) {
    setFieldError('rPasswordError', 'Password is required.');
    firstError = firstError || 'rPassword';
  } else if (password.length < 8) {
    setFieldError('rPasswordError', 'Password must be at least 8 characters.');
    firstError = firstError || 'rPassword';
  }

  if (!confirm) {
    setFieldError('rConfirmError', 'Please confirm your password.');
    firstError = firstError || 'rConfirm';
  } else if (password && confirm !== password) {
    setFieldError('rConfirmError', 'Passwords do not match.');
    firstError = firstError || 'rConfirm';
  }

  if (firstError) {
    document.getElementById(firstError).focus();
    return;
  }

  setAuthError('registerError', '');
  setAuthLoading('registerBtn', true, 'Creating account…');
  try {
    const { token, user } = await apiFetch('/api/auth/register', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, username, password, confirm })
    });
    saveAuth(token, user);
    currentUser = user;
    closeRegister();
    renderHeader();
    loadPosts();
  } catch (err) {
    setAuthError('registerError', err.message);
    setAuthLoading('registerBtn', false, 'Create Account');
  }
}

/* ── Auth: logout ── */
function logout() {
  clearAuth();
  currentUser = null;
  filterMine  = false;
  posts.forEach(p => { p.vote = null; });
  const mineBtn = document.getElementById('myPostsBtn');
  if (mineBtn) mineBtn.classList.remove('active');
  renderHeader();
  render();
  loadPosts();
}

/* ── Auth helpers ── */
function setAuthError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}
function setAuthLoading(btnId, on, label) {
  const btn = document.getElementById(btnId);
  btn.disabled    = on;
  btn.textContent = label;
}

/* ── Validate stored token on load ── */
async function checkAuth() {
  if (!getToken()) {
    renderHeader();
    return;
  }
  try {
    const user = await apiFetch('/api/auth/me');
    currentUser = user;
    saveAuth(getToken(), user);
  } catch {
    clearAuth();
    currentUser = null;
  }
  renderHeader();
}

/* ── New post modal ── */
function openModal() {
  if (!currentUser) { openLogin(); return; }
  document.getElementById('overlay').classList.add('open');
  document.getElementById('fTitle').focus();
}
function closeModal() {
  document.getElementById('overlay').classList.remove('open');
  document.getElementById('form').reset();
  pending.forEach(p => URL.revokeObjectURL(p.url));
  pending     = [];
  pendingTags = [];
  renderPreview();
  renderTagPills();
  clearAllFieldErrors();
  setSubmitting(false);
}
function onOverlayClick(e) {
  if (e.target === e.currentTarget) closeModal();
}

/* ── Image upload ── */
function onDragOver(e) {
  e.preventDefault();
  document.getElementById('zone').classList.add('drag');
}
function onDragLeave() { document.getElementById('zone').classList.remove('drag'); }
function onDrop(e) {
  e.preventDefault();
  onDragLeave();
  addFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
}
function onFileSelect(e) {
  addFiles(Array.from(e.target.files));
  e.target.value = '';
}
function addFiles(files) {
  files.forEach(file => pending.push({ file, url: URL.createObjectURL(file) }));
  renderPreview();
}
function removeImg(i) {
  URL.revokeObjectURL(pending[i].url);
  pending.splice(i, 1);
  renderPreview();
}
function renderPreview() {
  document.getElementById('previewGrid').innerHTML = pending
    .map((p, i) => `
      <div class="prev-item">
        <img src="${p.url}" alt="" />
        <button type="button" class="prev-rm" onclick="removeImg(${i})">&#215;</button>
      </div>`)
    .join('');
  // Clear image error as soon as user adds at least one image
  if (pending.length > 0) setImgError('');
}

function setImgError(msg) {
  const el = document.getElementById('imgError');
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
  document.getElementById('zone').classList.toggle('zone-error', !!msg);
}

/* ── Tag input ── */
function onTagKeydown(e) {
  const input = document.getElementById('fTag');
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = input.value.trim().toLowerCase().replace(/[,#]/g, '');
    if (val && !pendingTags.includes(val) && pendingTags.length < 10) {
      pendingTags.push(val);
      input.value = '';
      renderTagPills();
    }
  } else if (e.key === 'Backspace' && !input.value && pendingTags.length) {
    pendingTags.pop();
    renderTagPills();
  }
}
function removeTag(i) {
  pendingTags.splice(i, 1);
  renderTagPills();
}
function renderTagPills() {
  document.getElementById('tagPills').innerHTML = pendingTags
    .map((t, i) => `<span class="tag-pill">#${esc(t)}<button type="button" onclick="removeTag(${i})">&#215;</button></span>`)
    .join('');
}

/* ── Submit new post ── */
function setSubmitting(on) {
  const btn = document.getElementById('submitBtn');
  btn.disabled    = on;
  btn.textContent = on ? 'Posting…' : 'Share Post';
}

function setFieldError(errorId, msg) {
  const el = document.getElementById(errorId);
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
  // highlight the sibling input/textarea
  const field = el.closest('.field');
  if (field) {
    const input = field.querySelector('input, textarea');
    if (input) input.classList.toggle('input-error', !!msg);
  }
}
function clearFieldError(errorId) {
  setFieldError(errorId, '');
}
function clearAllFieldErrors() {
  ['titleError','descError','locationError'].forEach(id => setFieldError(id, ''));
  setImgError('');
}
function clearRegisterErrors() {
  ['rEmailError','rUsernameError','rPasswordError','rConfirmError'].forEach(id => setFieldError(id, ''));
  setAuthError('registerError', '');
}

async function submitPost(e) {
  e.preventDefault();
  if (!currentUser) { closeModal(); openLogin(); return; }

  const title    = document.getElementById('fTitle').value.trim();
  const desc     = document.getElementById('fDesc').value.trim();
  const location = document.getElementById('fLocation').value.trim();

  // Flush any typed-but-not-committed tag
  const tagInput = document.getElementById('fTag');
  const partial  = tagInput.value.trim().toLowerCase().replace(/[,#]/g, '');
  if (partial && !pendingTags.includes(partial) && pendingTags.length < 10) {
    pendingTags.push(partial);
    tagInput.value = '';
    renderTagPills();
  }

  // Validate all required fields
  let firstError = null;
  if (!title) {
    setFieldError('titleError', 'Title is required.');
    firstError = firstError || 'fTitle';
  }
  if (!desc) {
    setFieldError('descError', 'Description is required.');
    firstError = firstError || 'fDesc';
  }
  if (!location) {
    setFieldError('locationError', 'Location is required.');
    firstError = firstError || 'fLocation';
  }
  if (pending.length === 0) {
    setImgError('At least one image is required.');
    firstError = firstError || 'zone';
  }

  if (firstError) {
    document.getElementById(firstError).scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById(firstError).focus?.();
    return;
  }

  setSubmitting(true);
  try {
    const fd = new FormData();
    fd.append('title', title);
    fd.append('desc', desc);
    fd.append('location', location);
    fd.append('tags', JSON.stringify(pendingTags));
    pending.forEach(p => fd.append('images', p.file));

    const post = await apiFetch('/api/posts', { method: 'POST', body: fd });
    posts.unshift({ ...post, imgIdx: 0, vote: null });
    closeModal();
    render();
  } catch (err) {
    alert('Failed to create post: ' + err.message);
    setSubmitting(false);
  }
}

/* ── My Posts filter ── */
function toggleMineFilter(btn) {
  filterMine = !filterMine;
  btn.classList.toggle('active', filterMine);
  render();
}

/* ── Search ── */
function clearSearch() {
  document.getElementById('searchInput').value = '';
  render();
}
function filtered() {
  const query    = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  let   arr      = sorted();
  if (filterMine && currentUser) {
    arr = arr.filter(p => p.authorId === currentUser.id);
  }
  if (!query) return arr;
  const tagQuery = query.startsWith('#') ? query.slice(1) : query;
  return arr.filter(p =>
    p.title.toLowerCase().includes(query) ||
    (p.location && p.location.toLowerCase().includes(query)) ||
    (p.tags && p.tags.some(t => t.includes(tagQuery)))
  );
}

/* ── Sort ── */
function setSort(s, btn) {
  sort = s;
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  render();
}
function sorted() {
  const arr = [...posts];
  const net = p => p.up - p.down;
  if (sort === 'hot')  arr.sort((a, b) => (b.up + b.down) - (a.up + a.down));
  if (sort === 'up')   arr.sort((a, b) => net(b) - net(a));
  if (sort === 'down') arr.sort((a, b) => net(a) - net(b));
  return arr;
}

/* ── Vote ── */
async function castVote(id, type) {
  if (!currentUser) { openLogin(); return; }
  const p = posts.find(p => p.id === id);
  if (!p) return;

  const prev = p.vote;
  const next = p.vote === type ? null : type;

  p.vote = next;
  if (prev === 'up')   p.up--;
  if (prev === 'down') p.down--;
  if (next === 'up')   p.up++;
  if (next === 'down') p.down++;
  render();

  try {
    const updated = await apiFetch(`/api/posts/${id}/vote`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ next })
    });
    p.up   = updated.up;
    p.down = updated.down;
    p.vote = updated.myVote;
    render();
  } catch {
    p.vote = prev;
    if (next === 'up')   p.up--;
    if (next === 'down') p.down--;
    if (prev === 'up')   p.up++;
    if (prev === 'down') p.down++;
    render();
  }
}

/* ── Carousel ── */
function moveImg(id, dir) {
  const p = posts.find(p => p.id === id);
  if (!p) return;
  p.imgIdx = (p.imgIdx + dir + p.images.length) % p.images.length;
  if (activePostId === id) renderPostDetail();
  else render();
}

/* ── Helpers ── */
function timeAgo(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60)    return 'just now';
  if (s < 3600)  return Math.floor(s / 60)   + 'm ago';
  if (s < 86400) return Math.floor(s / 3600)  + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Render feed ── */
function render() {
  const feed  = document.getElementById('feed');
  const query = (document.getElementById('searchInput')?.value || '').trim();
  const clear = document.getElementById('searchClear');
  if (clear) clear.style.display = query ? 'flex' : 'none';

  const list = filtered();

  if (activePostId !== null) renderPostDetail();

  if (!list.length) {
    let emptyHtml;
    if (query) {
      emptyHtml = `<div class="empty-icon">🔍</div>
        <h3>No results for "${esc(query)}"</h3>
        <p>Try a different title, location, or tag.</p>`;
    } else if (filterMine) {
      emptyHtml = `<div class="empty-icon">📝</div>
        <h3>No posts yet</h3>
        <p>You haven't created any posts. Hit New Post to share something!</p>`;
    } else {
      emptyHtml = `<div class="empty-icon">📸</div>
        <h3>Nothing here yet</h3>
        <p>Create the first post and get the conversation started!</p>`;
    }
    feed.innerHTML = `<div class="empty">${emptyHtml}</div>`;
    return;
  }

  feed.innerHTML = list.map(p => {
    const net   = p.up - p.down;
    const color = net > 0 ? 'var(--upvote)' : net < 0 ? 'var(--downvote)' : 'var(--muted)';

    let imgHtml = '';
    if (p.images.length) {
      const multi = p.images.length > 1;
      imgHtml = `
        <div class="post-img-wrap">
          <img src="${p.images[p.imgIdx]}" alt="post image" />
          ${multi ? `
            <button class="carousel-btn carousel-prev" onclick="event.stopPropagation(); moveImg(${p.id}, -1)">&#8249;</button>
            <button class="carousel-btn carousel-next" onclick="event.stopPropagation(); moveImg(${p.id},  1)">&#8250;</button>
            <div class="dots">
              ${p.images.map((_, i) => `<div class="dot ${i === p.imgIdx ? 'active' : ''}"></div>`).join('')}
            </div>
            <div class="img-counter">${p.imgIdx + 1} / ${p.images.length}</div>` : ''}
        </div>`;
    }

    return `
      <div class="post-card" onclick="openPost(${p.id})">
        ${imgHtml}
        <div class="post-body">
          <div class="post-meta">
            <span class="post-author">@${esc(p.authorUsername || 'unknown')}</span>
            <span class="post-time">${timeAgo(p.ts)}</span>
          </div>
          <div class="post-title">${esc(p.title)}</div>
          ${p.desc     ? `<div class="post-desc">${esc(p.desc)}</div>` : ''}
          ${p.location ? `<div class="post-location">&#128205; ${esc(p.location)}</div>` : ''}
          ${p.tags && p.tags.length ? `<div class="post-tags">${p.tags.map(t => `<span class="tag-chip">#${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="post-actions">
          <button class="vote-btn up ${p.vote === 'up' ? 'voted' : ''}" onclick="event.stopPropagation(); castVote(${p.id}, 'up')">
            <svg viewBox="0 0 10 10"><path d="M5 1 L9 8 L1 8 Z"/></svg>
            ${p.up}
          </button>
          <button class="vote-btn down ${p.vote === 'down' ? 'voted' : ''}" onclick="event.stopPropagation(); castVote(${p.id}, 'down')">
            <svg viewBox="0 0 10 10"><path d="M5 9 L9 2 L1 2 Z"/></svg>
            ${p.down}
          </button>
          <div class="net-score" style="color:${color}">${net > 0 ? '+' : ''}${net}</div>
        </div>
      </div>`;
  }).join('');
}

/* ── Delete confirmation dialog ── */
let pendingDeleteId = null;

function deletePost(id) {
  const p = posts.find(p => p.id === id);
  pendingDeleteId = id;
  document.getElementById('confirmSubtitle').textContent =
    p ? `"${p.title}" will be permanently removed.` : 'This post will be permanently removed.';
  document.getElementById('confirmOverlay').classList.add('open');
}

function closeConfirm() {
  document.getElementById('confirmOverlay').classList.remove('open');
  pendingDeleteId = null;
}

function onConfirmOverlayClick(e) {
  if (e.target === e.currentTarget) closeConfirm();
}

async function confirmDeleteAction() {
  if (!pendingDeleteId) return;
  const id  = pendingDeleteId;
  const btn = document.getElementById('confirmDeleteBtn');
  btn.disabled    = true;
  btn.textContent = 'Deleting…';
  try {
    await apiFetch(`/api/posts/${id}`, { method: 'DELETE' });
    posts = posts.filter(p => p.id !== id);
    closeConfirm();
    closePost();
  } catch (err) {
    btn.disabled    = false;
    btn.textContent = 'Delete';
    document.getElementById('confirmSubtitle').textContent = 'Error: ' + err.message;
  }
}

/* ── Post detail ── */
function openPost(id) {
  activePostId = id;
  renderPostDetail();
  document.getElementById('detailOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closePost() {
  document.getElementById('detailOverlay').classList.remove('open');
  document.body.style.overflow = '';
  activePostId = null;
  render();
}
function onDetailOverlayClick(e) {
  if (e.target === e.currentTarget) closePost();
}

function renderPostDetail() {
  if (activePostId === null) return;
  const p = posts.find(p => p.id === activePostId);
  if (!p) return;

  const modal  = document.getElementById('detailModal');
  const hasImg = p.images && p.images.length > 0;
  modal.classList.toggle('no-image', !hasImg);

  const imgPanel = document.getElementById('detailImgPanel');
  if (hasImg) {
    const multi = p.images.length > 1;
    imgPanel.innerHTML = `
      <div class="detail-img-wrap">
        <img src="${p.images[p.imgIdx]}" alt="post image" />
        ${multi ? `
          <button class="carousel-btn carousel-prev" onclick="moveImg(${p.id},-1)">&#8249;</button>
          <button class="carousel-btn carousel-next" onclick="moveImg(${p.id}, 1)">&#8250;</button>
          <div class="dots">
            ${p.images.map((_,i) => `<div class="dot ${i===p.imgIdx?'active':''}"></div>`).join('')}
          </div>
          <div class="img-counter">${p.imgIdx+1} / ${p.images.length}</div>` : ''}
      </div>`;
  } else {
    imgPanel.innerHTML = '';
  }

  const net   = p.up - p.down;
  const color = net > 0 ? 'var(--upvote)' : net < 0 ? 'var(--downvote)' : 'var(--muted)';

  document.getElementById('detailInfoPanel').innerHTML = `
    <div class="detail-author-row">
      <span class="detail-author">@${esc(p.authorUsername || 'unknown')}</span>
      <span class="detail-time">${timeAgo(p.ts)}</span>
    </div>
    <h2 class="detail-title">${esc(p.title)}</h2>
    ${p.location ? `<div class="detail-location">&#128205; ${esc(p.location)}</div>` : ''}
    ${p.tags && p.tags.length ? `<div class="detail-tags">${p.tags.map(t=>`<span class="tag-chip">#${esc(t)}</span>`).join('')}</div>` : ''}
    ${p.desc ? `<div class="detail-desc">${esc(p.desc)}</div>` : ''}
    <div class="detail-actions">
      <button class="vote-btn up ${p.vote==='up'?'voted':''}" onclick="castVote(${p.id},'up')">
        <svg viewBox="0 0 10 10"><path d="M5 1 L9 8 L1 8 Z"/></svg>${p.up}
      </button>
      <button class="vote-btn down ${p.vote==='down'?'voted':''}" onclick="castVote(${p.id},'down')">
        <svg viewBox="0 0 10 10"><path d="M5 9 L9 2 L1 2 Z"/></svg>${p.down}
      </button>
      <div class="net-score" style="color:${color}">${net>0?'+':''}${net}</div>
    </div>
    ${currentUser && currentUser.id === p.authorId ? `
    <button class="btn-danger" onclick="deletePost(${p.id})">
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style="flex-shrink:0">
        <path d="M2 4h10M5 4V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V4M6 7v3M8 7v3M3 4l.7 7.3A1 1 0 004.7 12h4.6a1 1 0 001-.7L11 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Delete Post
    </button>` : ''}`;
}

/* ── Theme ── */
function toggleTheme() {
  const html  = document.documentElement;
  const isDark = html.classList.toggle('dark');
  localStorage.setItem('mw_theme', isDark ? 'dark' : 'light');
}

/* ── Keyboard shortcuts ── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('deleteAccountOverlay')?.classList.contains('open')) closeDeleteAccount();
    else if (pendingDeleteId !== null) closeConfirm();
    else if (activePostId !== null) closePost();
    else closeModal();
  }
});

/* ── Init ── */
checkAuth().then(loadPosts);
