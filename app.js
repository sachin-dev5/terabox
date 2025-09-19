// Simple in-memory cache for responses keyed by link
const responseCache = new Map();

function renderFile(file){
  const fName = document.getElementById('fName');
  const fSize = document.getElementById('fSize');
  const fCache = document.getElementById('fCache');
  const thumb = document.getElementById('thumb');
  const watchBtn = document.getElementById('watchBtn');
  const directBtn = document.getElementById('directBtn');
  const result = document.getElementById('result');

  if (!fName || !fSize || !fCache || !thumb || !watchBtn || !directBtn || !result) return;

  fName.textContent = file.file_name || 'N/A';
  fSize.textContent = file.file_size || 'N/A';
  fCache.textContent = formatDateTime(file.cached_at);

  const thumbWrap = document.querySelector('.thumb-wrap');
  const skeleton = document.querySelector('.thumb-wrap .skeleton');
  if (thumb) thumb.style.display = 'none';
  if (thumbWrap) thumbWrap.classList.remove('no-thumb');
  if (skeleton) skeleton.style.display = 'block';
  thumb.onload = function(){
    if (skeleton) skeleton.style.display = 'none';
    if (thumb) thumb.style.display = 'block';
  };
  thumb.onerror = function(){
    if (skeleton) skeleton.style.display = 'none';
    if (thumbWrap) thumbWrap.classList.add('no-thumb');
  };
  if (file.thumbnail) {
    thumb.src = file.thumbnail;
  } else {
    if (skeleton) skeleton.style.display = 'none';
    if (thumbWrap) thumbWrap.classList.add('no-thumb');
  }

  // Watch Online
  watchBtn.onclick = function(){ watchInline(this, file.stream_url); };
  watchBtn.disabled = !file.stream_url;

  // Direct Download (avoid exposing URL)
  if (file.direct_download){
    directBtn.dataset.url = file.direct_download;
    directBtn.classList.remove('disabled');
  } else {
    directBtn.dataset.url = '';
    directBtn.classList.add('disabled');
  }

  result.style.display = 'grid';
}
const BACKEND_URL = 'http://localhost:3000';

const ALLOWED_TERABOX_ORIGINS = [
  'https://terabox.com',
  'https://teraboxapp.com',
  'https://1024terabox.com',
  'https://www.teraboxapp.com',
  'https://www.1024terabox.com',
  'https://terabox1024.com',
  'https://terabox.app',
  'https://terasharelink.com'
];

function isValidShareLink(link){
  if (!link || typeof link !== 'string') return false;
  try {
    const u = new URL(link);
    return ALLOWED_TERABOX_ORIGINS.includes(u.origin) && u.pathname.startsWith('/s/');
  } catch {
    return false;
  }
}

function disablePill(element){
  element.classList.add('disabled');
  setTimeout(() => element.classList.remove('disabled'), 2500);
}

function showToast(text){
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = text || 'Copied to clipboard';
  toast.classList.add('show');
  setTimeout(()=> toast.classList.remove('show'), 1400);
}

function formatDateTime(input){
  if (!input || typeof input !== 'string') return 'N/A';
  const d = new Date(input);
  if (isNaN(d.getTime())) return 'N/A';
  try {
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  } catch {
    return d.toISOString();
  }
}

async function handleFetch(btn){
  const linkEl = document.getElementById('linkInput');
  const errorEl = document.getElementById('error');
  const result = document.getElementById('result');
  const fName = document.getElementById('fName');
  const fSize = document.getElementById('fSize');
  const fCache = document.getElementById('fCache');
  const thumb = document.getElementById('thumb');
  const inlinePlayer = document.getElementById('inlinePlayer');
  const watchBtn = document.getElementById('watchBtn');
  const directBtn = document.getElementById('directBtn');

  if (!linkEl || !errorEl || !fName || !fSize || !fCache || !thumb || !inlinePlayer || !watchBtn || !directBtn) {
    console.error('Required DOM elements are missing');
    if (errorEl) errorEl.textContent = 'A required element is missing on the page.';
    return;
  }

  errorEl.textContent = '';
  // Prepare UI for loading state
  const thumbWrap = document.querySelector('.thumb-wrap');
  const thumbSkeleton = document.querySelector('.thumb-wrap .skeleton');
  if (thumbWrap) {
    thumbWrap.classList.remove('no-thumb');
    thumbWrap.classList.remove('playing');
  }
  if (thumb) thumb.style.display = 'none';
  if (inlinePlayer) {
    try { inlinePlayer.pause(); } catch {}
    inlinePlayer.removeAttribute('src');
    inlinePlayer.style.display = 'none';
  }
  if (thumbSkeleton) thumbSkeleton.style.display = 'block';
  if (result) result.style.display = 'grid';
  watchBtn.disabled = true;
  directBtn.classList.add('disabled');

  // Details skeletons removed per request

  const link = linkEl.value.trim();
  if(!link){ errorEl.textContent = 'Please paste a valid TeraBox link.'; return; }

  // Frontend validation: only allow specific TeraBox share domains
  try {
    const u = new URL(link);
    const allowed = ALLOWED_TERABOX_ORIGINS.includes(u.origin);
    const validPath = u.pathname.startsWith('/s/');
    if (!allowed || !validPath) {
      errorEl.textContent = 'Only TeraBox share links are allowed (approved domains only).';
      return;
    }
  } catch {
    errorEl.textContent = 'Invalid URL format.';
    return;
  }

  // Cache hit: render and return
  if (responseCache.has(link)) {
    renderFile(responseCache.get(link));
    return;
  }

  btn.disabled = true;

  try{
    const res = await fetch(BACKEND_URL + '/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link })
    });

    if(!res.ok){
      const t = await res.text();
      throw new Error(t || ('HTTP ' + res.status));
    }

    const apiResponse = await res.json();
    const payload = (apiResponse && typeof apiResponse === 'object' && apiResponse.data && typeof apiResponse.data === 'object')
      ? apiResponse.data
      : apiResponse;

    // Normalize fields regardless of upstream naming
    const file = {
      file_name: payload.file_name || payload.filename || 'N/A',
      file_size: payload.file_size || payload.size || 'N/A',
      thumbnail: payload.thumbnail || payload.thumb || '',
      stream_url: payload.stream_url || payload.stream || payload.play_url || '',
      direct_download: payload.direct_download || payload.download_url || '',
      cached_at: payload.cached_at || payload.cachedAt || 'N/A'
    };
    // Cache and render
    responseCache.set(link, file);
    renderFile(file);

  }catch(err){
    console.error(err);
    if (errorEl) {
      let msg = 'Failed to fetch';
      try {
        const parsed = JSON.parse(err.message);
        msg = parsed?.error || parsed?.message || msg;
      } catch {}
      errorEl.textContent = 'Error: ' + (err.message || msg);
    }
  }finally{
    // Re-enable based on current input validity
    const current = linkEl.value.trim();
    btn.disabled = !isValidShareLink(current);
    // no-op: skeletons removed
  }
}

function watchInline(btn, url){
  if(!url){ return; }
  btn.classList.add('disabled');
  const thumbWrap = document.querySelector('.thumb-wrap');
  const skeleton = document.querySelector('.thumb-wrap .skeleton');
  const img = document.getElementById('thumb');
  const inline = document.getElementById('inlinePlayer');
  if (thumbWrap) thumbWrap.classList.add('playing');
  if (inline) {
    inline.src = url;
    inline.style.display = 'block';
    try { inline.play().catch(()=>{}); } catch {}
  }
  setTimeout(()=>btn.classList.remove('disabled'), 600);
}

function closeModal(){
  const modal = document.getElementById('videoModal');
  const player = document.getElementById('videoPlayer');
  try { player.pause(); player.currentTime = 0; } catch(e){}
  modal.style.display = 'none';
  player.src = '';
}

window.addEventListener('DOMContentLoaded', () => {
  const fetchBtn = document.getElementById('fetchBtn');
  const linkInput = document.getElementById('linkInput');
  const directBtn = document.getElementById('directBtn');
  const watchBtn = document.getElementById('watchBtn');
  const closeModalBtn = document.getElementById('closeModalBtn');

  if (fetchBtn) fetchBtn.addEventListener('click', (e) => {
    e.preventDefault();
    handleFetch(fetchBtn);
  });

  // Disable Fetch until a valid TeraBox URL is present
  if (fetchBtn && linkInput) {
    const setState = () => {
      const val = linkInput.value.trim();
      fetchBtn.disabled = !isValidShareLink(val);
    };
    setState();
    linkInput.addEventListener('input', setState);
    linkInput.addEventListener('change', setState);
    linkInput.addEventListener('paste', () => setTimeout(setState, 0));
  }

  if (directBtn) directBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const url = directBtn.dataset.url || '';
    if (!url) return;
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {}
    disablePill(directBtn);
  });

  if (directBtn) directBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      directBtn.click();
    }
  });

  if (watchBtn) watchBtn.addEventListener('click', (e) => {
    e.preventDefault();
    // url is set after fetch; we keep handler assignment inside handleFetch
  });

  if (closeModalBtn) closeModalBtn.addEventListener('click', (e) => {
    e.preventDefault();
    closeModal();
  });
});


