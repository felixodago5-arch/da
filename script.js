// ════════════════════════════════════════
//  FIREBASE INIT
// ════════════════════════════════════════
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js';
import {
    getFirestore, collection, getDocs, doc, getDoc,
    addDoc, updateDoc, deleteDoc, query, where,
    orderBy, onSnapshot, serverTimestamp, setDoc
} from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-storage.js';
import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/11.0.1/firebase-messaging.js';

const firebaseConfig = {
    apiKey: "AIzaSyAh0JpM0BqgCwxkhFG32m6VH6okQIiSops",
    authDomain: "felix-portfolio-8b3a8.firebaseapp.com",
    projectId: "felix-portfolio-8b3a8",
    storageBucket: "felix-portfolio-8b3a8.firebasestorage.app",
    messagingSenderId: "439075265698",
    appId: "1:439075265698:web:058c014a4f4c32a9444bfb"
};

const app       = initializeApp(firebaseConfig);
const auth      = getAuth(app);
const db        = getFirestore(app);
const storage   = getStorage(app);
const messaging = getMessaging(app);
const VAPID_KEY = 'BEXAFghi2VaVz5RBCkZmrU-XoKLG4f48EpwOmzC7XkdN9QWcW_oSh-k42hNbRVqqvVQUI3B0hwer2x6EWqlatsM';
const ADMIN_UID = 'eUmOKNfS5ac1glpBQvTUt0zZw1i2';

// ════════════════════════════════════════
//  AUTH GUARD — redirect if not admin
// ════════════════════════════════════════
onAuthStateChanged(auth, user => {
    if (!user) { window.location.replace('login.html'); return; }
    if (user.uid !== ADMIN_UID) { window.location.replace('client.html'); return; }
    initDashboard();
});

// ════════════════════════════════════════
//  FCM TOKEN SETUP (Admin)
// ════════════════════════════════════════
async function setupNotifications() {
    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log('Notification permission not granted');
            return;
        }
        const token = await getToken(messaging, { vapidKey: VAPID_KEY });
        if (token) {
            await setDoc(doc(db, 'fcmTokens', ADMIN_UID), {
                token,
                role: 'admin',
                updatedAt: new Date().toISOString()
            });
            console.log('%c🔔 Admin notifications enabled', 'color:#14b8a6;font-weight:600;');
        }
    } catch (err) {
        console.warn('FCM setup failed:', err);
    }

    onMessage(messaging, payload => {
        console.log('Foreground message:', payload);
    });
}

// ════════════════════════════════════════
//  INACTIVITY AUTO SIGN-OUT (30 min)
// ════════════════════════════════════════
let inactivityTimer;
function resetInactivity() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(async () => {
        await signOut(auth);
        window.location.replace('login.html');
    }, 30 * 60 * 1000);
}
['mousemove','keydown','click','touchstart'].forEach(e =>
    document.addEventListener(e, resetInactivity, { passive: true })
);

// ── PAGE VISIBILITY LOCK ──
let lockTimer = null;
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        lockTimer = setTimeout(() => {
            signOut(auth).finally(() => {
                window.location.href = 'login.html?locked=1';
            });
        }, 60 * 1000);
    } else {
        clearTimeout(lockTimer);
        lockTimer = null;
    }
});

// ════════════════════════════════════════
//  CACHE
// ════════════════════════════════════════
let _designs      = [];
let _commissions  = [];
let _testimonials = [];
let _users        = [];
let _reviews      = [];

// ════════════════════════════════════════
//  REVIEWS
// ════════════════════════════════════════
function renderReviews() {
    const total    = _reviews.length;
    const positive = _reviews.filter(r => r.thumb === 'up').length;
    const negative = total - positive;
    const pct      = total ? Math.round((positive / total) * 100) : 0;

    // Update summary cards
    const el = id => document.getElementById(id);
    if (el('reviewTotal'))    el('reviewTotal').textContent    = total;
    if (el('reviewPositive')) el('reviewPositive').textContent = positive;
    if (el('reviewNegative')) el('reviewNegative').textContent = negative;
    if (el('reviewPct'))      el('reviewPct').textContent      = total ? `${pct}% positive` : '—';

    // Update sidebar badge
    const badge = document.getElementById('reviewsBadge');
    if (badge) {
        if (total > 0) { badge.textContent = total; badge.style.display = 'inline-flex'; }
        else badge.style.display = 'none';
    }

    // Update notification dropdown
    const notifItem = document.querySelector('#ddNotif .dd-menu a:nth-child(2)');
    if (notifItem && total > 0) {
        notifItem.textContent = `👍 ${total} portfolio review${total > 1 ? 's' : ''} received`;
    }

    // Render list
    const list = document.getElementById('reviewsList');
    if (!list) return;
    if (!total) return;

    list.innerHTML = [..._reviews].reverse().map(r => {
        const isUp = r.thumb === 'up';
        const date = r.createdAt
            ? new Date(r.createdAt).toLocaleDateString('en-KE', {day:'numeric', month:'short', year:'numeric'})
            : 'Recently';
        return `
        <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--b1);">
            <div style="width:36px;height:36px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px;background:${isUp ? 'var(--ok-s)' : 'var(--danger-s)'};">
                ${isUp ? '👍' : '👎'}
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:13px;color:var(--t1);line-height:1.5;">${r.reason || 'No comment left.'}</div>
                <div style="font-size:11px;color:var(--t4);margin-top:4px;">${date}</div>
            </div>
            <span style="font-size:10px;font-weight:600;padding:3px 9px;border-radius:99px;flex-shrink:0;background:${isUp ? 'var(--ok-s)' : 'var(--danger-s)'};color:${isUp ? 'var(--ok)' : 'var(--danger)'};">
                ${isUp ? 'Positive' : 'Needs Work'}
            </span>
        </div>`;
    }).join('');
}
 
// ════════════════════════════════════════
//  BOOT
// ════════════════════════════════════════
async function initDashboard() {
    const loader = document.getElementById('authLoader');
    if (loader) loader.remove();

    resetInactivity();
    setupNotifications();
    await loadAllData();
    initUI();
    console.log('%c🎨 Felix James Dashboard ready (Admin)', 'color:#14b8a6;font-weight:800;');
}

 
async function loadAllData() {
    try {
       const [designs, commissions, testimonials, users] = await Promise.all([
    fetchCol('designs').catch(() => []),
    fetchCol('commissions').catch(() => []),
    fetchCol('testimonials').catch(() => []),
    fetchCol('users').catch(() => []),
    fetchCol('reviews').catch(() => [])
]);
_designs      = designs;
_commissions  = commissions;
_testimonials = testimonials;
_users        = users;
    } catch (err) {
        console.warn('Data load error:', err);
    }

    // Always render even if data fetch fails
    renderStatCards();
    renderRecentActivity();
    renderCommissionProgress();
    renderKanban();
    renderShowcase();
    renderUsersPage();
    renderTestimonialsBadge();
    renderReviews();
}
 
async function fetchCol(name) {
    const snap = await getDocs(collection(db, name));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
 
// ════════════════════════════════════════
//  STAT CARDS
// ════════════════════════════════════════
function renderStatCards() {
    const vals = document.querySelectorAll('.sc-val');
    if (vals[0]) vals[0].textContent = _designs.length;
    if (vals[1]) vals[1].textContent = _testimonials.length;
    // vals[2] = views (static for now)
    const active = _commissions.filter(c => c.status === 'in-progress' || c.status === 'review').length;
    if (vals[3]) vals[3].textContent = active;
}
 
// ════════════════════════════════════════
//  RECENT ACTIVITY
// ════════════════════════════════════════
function renderRecentActivity() {
    const tbody = document.querySelector('.at tbody');
    if (!tbody) return;
    const recent = [..._designs].reverse().slice(0, 5);
    const actionMap = { done:'Completed', 'in-progress':'Updated', review:'In Review', draft:'Drafted' };
    tbody.innerHTML = recent.map(d => `
        <tr>
            <td>${actionMap[d.status] || 'Updated'}</td>
            <td>${d.title || '—'}</td>
            <td>Felix J.</td>
            <td>Recently</td>
        </tr>`).join('');
}
 
// ════════════════════════════════════════
//  COMMISSION PROGRESS
// ════════════════════════════════════════
function renderCommissionProgress() {
    const container = document.querySelector('.cp:nth-child(2)');
    if (!container) return;
    const heading = container.querySelector('h3');
    container.innerHTML = '';
    if (heading) container.appendChild(heading);
    if (!_commissions.length) {
        container.innerHTML += '<p style="color:var(--t3);font-size:12px;padding:12px 0;">No commissions yet.</p>';
        return;
    }
    const colorMap = {
        'in-progress': { border:'var(--accent)', bar:'var(--accent)' },
        'review':      { border:'var(--warn)',   bar:'var(--warn)' },
        'draft':       { border:'var(--info)',   bar:'var(--info)' },
        'done':        { border:'var(--ok)',     bar:'var(--ok)' }
    };
    _commissions.slice(0,4).forEach(c => {
        const progress = c.progress ?? 50;
        const colors = colorMap[c.status] || colorMap['draft'];
        const label = (c.status || 'draft').replace('-',' ').replace(/\b\w/g, l => l.toUpperCase());
        const item = document.createElement('div');
        item.className = 'proj-item';
        item.innerHTML = `
            <div class="proj-ring" style="border:2px solid ${colors.border};color:${colors.border};">${progress}%</div>
            <div class="proj-inf">
                <div class="proj-name">${c.project || c.title || 'Untitled'}</div>
                <div class="proj-meta">${label} · ${c.type || c.category || 'Design'}</div>
                <div class="pbar-bg"><div class="pbar" style="width:${progress}%;background:${colors.bar};"></div></div>
            </div>`;
        container.appendChild(item);
    });
}
 
// ════════════════════════════════════════
//  KANBAN
// ════════════════════════════════════════
function renderKanban() {
    const columns = {
        'draft':       document.querySelector('.kb-col:nth-child(1)'),
        'in-progress': document.querySelector('.kb-col:nth-child(2)'),
        'review':      document.querySelector('.kb-col:nth-child(3)'),
        'done':        document.querySelector('.kb-col:nth-child(4)')
    };
    const pillClass = { 'draft':'draft','in-progress':'ip','review':'rev','done':'done' };
    const pillLabel = { 'draft':'Draft','in-progress':'In Progress','review':'Review','done':'Done' };
 
    Object.values(columns).forEach(col => {
        if (!col) return;
        col.querySelectorAll('.kb-item').forEach(i => i.remove());
        const cnt = col.querySelector('.kb-cnt');
        if (cnt) cnt.textContent = '0';
    });
 
    const grouped = { draft:[], 'in-progress':[], review:[], done:[] };
    _designs.forEach(d => {
        const s = d.status || 'draft';
        (grouped[s] ? grouped[s] : grouped['draft']).push(d);
    });
 
    Object.entries(grouped).forEach(([status, items]) => {
        const col = columns[status];
        if (!col) return;
        const cnt = col.querySelector('.kb-cnt');
        if (cnt) cnt.textContent = items.length;
        items.forEach(d => {
            const item = document.createElement('div');
            item.className = 'kb-item';
            item.dataset.id = d.id;
            item.style.cursor = 'pointer';
            item.innerHTML = `${d.title || 'Untitled'} <span class="pill ${pillClass[status]}">${pillLabel[status]}</span>`;
            item.addEventListener('click', () => openDesignModal(d));
            col.appendChild(item);
        });
    });
}
 
// ════════════════════════════════════════
//  SHOWCASE
// ════════════════════════════════════════
function renderShowcase() {
    const grid = document.querySelector('.showcase-grid');
    if (!grid) return;
    grid.innerHTML = _designs.map(d => {
        const thumb = d.image && d.image.startsWith('http')
            ? `<img src="${d.image}" alt="${d.title}" style="width:100%;height:100%;object-fit:cover;" loading="lazy" onerror="this.parentElement.innerHTML='🖼️'">`
            : `<span style="font-size:32px;">${d.image || '🖼️'}</span>`;
        return `
            <div class="sk" data-category="${(d.category||'').toLowerCase()}" data-id="${d.id}">
                <div class="sk-thumb">${thumb}</div>
                <div class="sk-info">
                    <h4>${d.title || 'Untitled'}</h4>
                    <p>${d.category || ''} · ${d.description || ''}</p>
                </div>
                <div style="display:flex;gap:5px;padding:0 13px 12px;">
                    <button class="qa-btn" style="margin:0;font-size:11px;padding:5px 9px;" onclick="openDesignModal(${JSON.stringify(d).split('"').join("'")})">✏️ Edit</button>
                    <button class="qa-btn" style="margin:0;font-size:11px;padding:5px 9px;color:var(--danger);" onclick="deleteDesign('${d.id}','${d.imagePath||''}')">🗑️ Delete</button>
                </div>
            </div>`;
    }).join('');
 
    // Showcase filter
    document.getElementById('showFilter')?.addEventListener('click', e => {
        const b = e.target.closest('.fb'); if (!b) return;
        document.querySelectorAll('#showFilter .fb').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const filter = b.dataset.f;
        document.querySelectorAll('.showcase-grid .sk').forEach(card => {
            const cat = (card.dataset.category||'').toLowerCase();
            card.style.display = (filter==='all' || cat.includes(filter)) ? '' : 'none';
        });
    });
}
 
// ════════════════════════════════════════
//  USERS PAGE (real data)
// ════════════════════════════════════════
function renderUsersPage() {
    // Admin card
    const adminCard = document.querySelector('.admin-card');
    if (adminCard) {
        const lastLogin = new Date().toLocaleDateString('en-KE', {day:'numeric',month:'short',year:'numeric'});
        adminCard.querySelector('h3').textContent = 'Felix James';
    }
 
    // Users table
    const tbody = document.querySelector('.ut tbody');
    if (!tbody) return;
 
    // Admin row always first
    const adminRow = `
        <tr>
            <td><div class="u-cell"><div class="u-av">FJ</div><div><div class="u-name">Felix James</div><div class="u-email">jamesodago6@gmail.com</div></div></div></td>
            <td><span class="role admin">Admin</span></td>
            <td><span class="status-ind"><span class="dot on"></span>Online</span></td>
            <td>Now</td><td>Chrome · Windows</td><td>Nairobi, KE</td>
        </tr>`;
 
    // Client rows from Firestore users collection
    const clientRows = _users
        .filter(u => u.role === 'client')
        .map(u => {
            const initials = (u.name || u.email || 'U').slice(0,2).toUpperCase();
            const lastLogin = u.lastLogin
                ? new Date(u.lastLogin).toLocaleDateString('en-KE',{day:'numeric',month:'short'})
                : 'Unknown';
            return `
                <tr>
                    <td><div class="u-cell"><div class="u-av">${initials}</div><div><div class="u-name">${u.name || 'Client'}</div><div class="u-email">${u.email || '—'}</div></div></div></td>
                    <td><span class="role client">Client</span></td>
                    <td><span class="status-ind"><span class="dot off"></span>Offline</span></td>
                    <td>${lastLogin}</td><td>—</td><td>—</td>
                </tr>`;
        }).join('');
 
    // Commission clients not yet in users (commissioned but haven't logged in)
    const loggedEmails = _users.map(u => u.email);
    const commissionClientRows = _commissions
        .filter(c => c.clientEmail && !loggedEmails.includes(c.clientEmail))
        .map(c => {
            const initials = (c.clientName || c.clientEmail || 'C').slice(0,2).toUpperCase();
            return `
                <tr>
                    <td><div class="u-cell"><div class="u-av">${initials}</div><div><div class="u-name">${c.clientName || 'Client'}</div><div class="u-email">${c.clientEmail}</div></div></div></td>
                    <td><span class="role client">Client</span></td>
                    <td><span class="status-ind"><span class="dot off"></span>Invited</span></td>
                    <td>Never</td><td>—</td><td>—</td>
                </tr>`;
        }).join('');
 
    tbody.innerHTML = adminRow + clientRows + commissionClientRows;
}
 
// ════════════════════════════════════════
//  TESTIMONIALS BADGE
// ════════════════════════════════════════
function renderTestimonialsBadge() {
    if (!_testimonials.length) return;
    const latest = _testimonials[_testimonials.length - 1];
    const stars = '★'.repeat(latest.rating || 5);
    const item = document.querySelector('#ddNotif .dd-menu a:nth-child(2)');
    if (item) item.textContent = `${stars} Review from ${(latest.name||'').trim()}`;
}
 
// ════════════════════════════════════════
//  DESIGN MODAL (Add / Edit)
// ════════════════════════════════════════
function createDesignModal() {
    if (document.getElementById('designModal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'designModal';
    overlay.style.cssText = `
        display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);
        z-index:500;align-items:center;justify-content:center;backdrop-filter:blur(4px);
    `;
    overlay.innerHTML = `
        <div style="background:var(--card);border:1px solid var(--b2);border-radius:18px;padding:26px;width:100%;max-width:500px;max-height:90vh;overflow-y:auto;margin:20px;position:relative;animation:fadeUp 0.25s ease;">
            <button onclick="closeDesignModal()" style="position:absolute;top:14px;right:16px;background:none;border:none;color:var(--t3);font-size:18px;cursor:pointer;">✕</button>
            <h3 id="modalTitle" style="font-family:var(--font-display);font-size:17px;font-weight:800;color:var(--t1);margin-bottom:20px;">New Design</h3>
 
            <input type="hidden" id="editDesignId">
            <input type="hidden" id="editImagePath">
 
            <div style="margin-bottom:14px;">
                <label style="display:block;font-size:12px;font-weight:600;color:var(--t2);margin-bottom:6px;">Title *</label>
                <input id="dTitle" type="text" placeholder="e.g. ZURI FRESH Label" style="${inputStyle()}">
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
                <div>
                    <label style="display:block;font-size:12px;font-weight:600;color:var(--t2);margin-bottom:6px;">Category</label>
                    <select id="dCategory" style="${inputStyle()}">
                        <option value="">Select…</option>
                        <option>Branding</option><option>Poster</option><option>Logo</option>
                        <option>Social</option><option>Print</option><option>Other</option>
                    </select>
                </div>
                <div>
                    <label style="display:block;font-size:12px;font-weight:600;color:var(--t2);margin-bottom:6px;">Status</label>
                    <select id="dStatus" style="${inputStyle()}">
                        <option value="draft">Draft</option>
                        <option value="in-progress">In Progress</option>
                        <option value="review">Review</option>
                        <option value="done">Done</option>
                    </select>
                </div>
            </div>
            <div style="margin-bottom:14px;">
                <label style="display:block;font-size:12px;font-weight:600;color:var(--t2);margin-bottom:6px;">Description</label>
                <textarea id="dDesc" placeholder="Brief description…" rows="2" style="${inputStyle()}resize:vertical;"></textarea>
            </div>
            <div style="margin-bottom:20px;">
                <label style="display:block;font-size:12px;font-weight:600;color:var(--t2);margin-bottom:6px;">Image Upload</label>
                <div id="dropZone" style="border:2px dashed var(--b2);border-radius:10px;padding:20px;text-align:center;cursor:pointer;transition:all 0.2s;background:var(--input);">
                    <div id="dropText" style="color:var(--t3);font-size:13px;">📁 Click to upload or drag & drop<br><span style="font-size:11px;color:var(--t4);">PNG, JPG, WebP — max 5MB</span></div>
                    <img id="imgPreview" style="display:none;max-width:100%;max-height:140px;border-radius:8px;margin-top:8px;object-fit:contain;">
                    <input type="file" id="imgFile" accept="image/*" style="display:none;">
                </div>
            </div>
            <div id="uploadProgress" style="display:none;margin-bottom:14px;">
                <div style="height:4px;background:var(--b1);border-radius:99px;overflow:hidden;">
                    <div id="uploadBar" style="height:100%;background:var(--accent);border-radius:99px;width:0%;transition:width 0.3s;"></div>
                </div>
                <p style="font-size:11px;color:var(--t3);margin-top:5px;" id="uploadMsg">Uploading…</p>
            </div>
            <div id="modalMsg" style="display:none;padding:8px 12px;border-radius:8px;font-size:12px;margin-bottom:12px;"></div>
            <div style="display:flex;gap:8px;">
                <button id="saveDesignBtn" onclick="saveDesign()" style="flex:1;padding:10px;border-radius:10px;border:none;background:var(--accent);color:#fff;font-family:var(--font-display);font-size:14px;font-weight:700;cursor:pointer;transition:all 0.2s;">
                    Save Design
                </button>
                <button onclick="closeDesignModal()" style="padding:10px 18px;border-radius:10px;border:1px solid var(--b2);background:transparent;color:var(--t2);font-size:13px;cursor:pointer;">Cancel</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
 
    // Drop zone
    const zone = document.getElementById('dropZone');
    const fileInput = document.getElementById('imgFile');
    zone.addEventListener('click', () => fileInput.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--accent)'; });
    zone.addEventListener('dragleave', () => zone.style.borderColor = 'var(--b2)');
    zone.addEventListener('drop', e => {
        e.preventDefault(); zone.style.borderColor = 'var(--b2)';
        if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
    });
 
    overlay.addEventListener('click', e => { if (e.target === overlay) closeDesignModal(); });
}
 
function inputStyle() {
    return 'width:100%;padding:9px 12px;border-radius:9px;border:1px solid var(--b2);background:var(--input);color:var(--t1);font-size:13px;font-family:var(--font-sans);outline:none;';
}
 
function handleFileSelect(file) {
    if (file.size > 5 * 1024 * 1024) {
        showModalMsg('error', '⚠️ File too large. Max 5MB.'); return;
    }
    const reader = new FileReader();
    reader.onload = e => {
        const prev = document.getElementById('imgPreview');
        prev.src = e.target.result;
        prev.style.display = 'block';
        document.getElementById('dropText').style.display = 'none';
    };
    reader.readAsDataURL(file);
}
 
window.openDesignModal = function(design) {
    createDesignModal();
    const modal = document.getElementById('designModal');
    modal.style.display = 'flex';
 
    // Reset
    ['dTitle','dDesc'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('dCategory').value = '';
    document.getElementById('dStatus').value = 'draft';
    document.getElementById('editDesignId').value = '';
    document.getElementById('editImagePath').value = '';
    document.getElementById('imgPreview').style.display = 'none';
    document.getElementById('imgPreview').src = '';
    document.getElementById('dropText').style.display = 'block';
    document.getElementById('imgFile').value = '';
    document.getElementById('uploadProgress').style.display = 'none';
    hideModalMsg();
 
    if (design && design.id) {
        document.getElementById('modalTitle').textContent = 'Edit Design';
        document.getElementById('editDesignId').value = design.id;
        document.getElementById('editImagePath').value = design.imagePath || '';
        document.getElementById('dTitle').value = design.title || '';
        document.getElementById('dCategory').value = design.category || '';
        document.getElementById('dStatus').value = design.status || 'draft';
        document.getElementById('dDesc').value = design.description || '';
        if (design.image && design.image.startsWith('http')) {
            document.getElementById('imgPreview').src = design.image;
            document.getElementById('imgPreview').style.display = 'block';
            document.getElementById('dropText').style.display = 'none';
        }
    } else {
        document.getElementById('modalTitle').textContent = 'New Design';
    }
};
 
window.closeDesignModal = function() {
    const modal = document.getElementById('designModal');
    if (modal) modal.style.display = 'none';
};
 
window.saveDesign = async function() {
    const id       = document.getElementById('editDesignId').value;
    const title    = document.getElementById('dTitle').value.trim();
    const category = document.getElementById('dCategory').value;
    const status   = document.getElementById('dStatus').value;
    const desc     = document.getElementById('dDesc').value.trim();
    const file     = document.getElementById('imgFile').files[0];
    const oldPath  = document.getElementById('editImagePath').value;
 
    if (!title) { showModalMsg('error', 'Title is required.'); return; }
 
    const btn = document.getElementById('saveDesignBtn');
    btn.disabled = true; btn.textContent = 'Saving…';
 
    try {
        let imageUrl = document.getElementById('imgPreview').src || '';
        let imagePath = oldPath;
 
        // Upload new image if selected
        if (file) {
            document.getElementById('uploadProgress').style.display = 'block';
            const path = `designs/${Date.now()}_${file.name.replace(/\s/g,'_')}`;
            const storageRef = ref(storage, path);
            await uploadBytes(storageRef, file);
            imageUrl = await getDownloadURL(storageRef);
            imagePath = path;
            document.getElementById('uploadBar').style.width = '100%';
            document.getElementById('uploadMsg').textContent = 'Upload complete ✓';
 
            // Delete old image from storage if replacing
            if (oldPath) {
                try { await deleteObject(ref(storage, oldPath)); } catch {}
            }
        }
 
        const data = { title, category, status, description: desc, image: imageUrl, imagePath, updatedAt: new Date().toISOString() };
 
        if (id) {
            await updateDoc(doc(db, 'designs', id), data);
            showModalMsg('success', '✅ Design updated successfully.');
        } else {
            data.createdAt = new Date().toISOString();
            await addDoc(collection(db, 'designs'), data);
            showModalMsg('success', '✅ Design added successfully.');
        }
 
        await loadAllData();
        setTimeout(closeDesignModal, 1200);
 
    } catch (err) {
        console.error(err);
        showModalMsg('error', '❌ Failed to save. ' + err.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Save Design';
    }
};
 
window.deleteDesign = async function(id, imagePath) {
    if (!confirm('Delete this design? This cannot be undone.')) return;
    try {
        await deleteDoc(doc(db, 'designs', id));
        if (imagePath) {
            try { await deleteObject(ref(storage, imagePath)); } catch {}
        }
        await loadAllData();
    } catch (err) {
        alert('Failed to delete: ' + err.message);
    }
};
 
function showModalMsg(type, text) {
    const el = document.getElementById('modalMsg');
    if (!el) return;
    el.style.display = 'block';
    el.style.background = type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)';
    el.style.color = type === 'error' ? '#ef4444' : '#10b981';
    el.style.border = `1px solid ${type === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}`;
    el.textContent = text;
}
function hideModalMsg() {
    const el = document.getElementById('modalMsg');
    if (el) { el.style.display = 'none'; el.textContent = ''; }
}
 
// ════════════════════════════════════════
//  QUICK ACTIONS (New Design button)
// ════════════════════════════════════════
function bindQuickActions() {
    const btns = document.querySelectorAll('.qa-btn');
    btns.forEach(btn => {
        const text = btn.textContent.trim();
        if (text.includes('New Design')) {
            btn.addEventListener('click', () => openDesignModal(null));
        }
    });
}
 
// ════════════════════════════════════════
//  MESSAGES (Admin side — real-time)
// ════════════════════════════════════════
let activeThreadId = null;
let unsubMessages  = null;
 
function loadAdminMessages(clientUid, clientName, clientInit) {
    if (unsubMessages) unsubMessages();
    activeThreadId = [ADMIN_UID, clientUid].sort().join('_');
 
    const q = query(
        collection(db, 'messages', activeThreadId, 'msgs'),
        orderBy('createdAt')
    );
    unsubMessages = onSnapshot(q, snap => {
        const box = document.getElementById('msgs');
        if (!box) return;
        box.innerHTML = '<div class="date-div">Today</div>';
        snap.docs.forEach(d => {
            const m = d.data();
            const isOut = m.senderUid === ADMIN_UID;
            const row = document.createElement('div');
            row.className = `msg-row ${isOut ? 'out' : 'in'}`;
            const time = m.createdAt?.toDate
                ? m.createdAt.toDate().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
                : 'now';
            row.innerHTML = `
                ${!isOut ? `<div class="msg-av">${clientInit}</div>` : ''}
                <div><div class="bubble">${m.text}</div></div>
                <span class="msg-t">${time}</span>
                ${isOut ? '<div class="msg-av">FJ</div>' : ''}`;
            box.appendChild(row);
        });
        box.scrollTop = box.scrollHeight;
    });
}
 
async function adminSend() {
    const inp = document.getElementById('msgInput');
    const text = (inp.value || '').trim();
    if (!text || !activeThreadId) return;
    inp.value = '';
    await addDoc(collection(db, 'messages', activeThreadId, 'msgs'), {
        text,
        senderUid: ADMIN_UID,
        senderName: 'Felix James',
        createdAt: serverTimestamp()
    });
}
 
// ════════════════════════════════════════
//  MAIN UI INIT
// ════════════════════════════════════════
function initUI() {
    const html    = document.documentElement;
    const sidebar = document.getElementById('sidebar');
    const sbOverlay = document.getElementById('sbOverlay');
    const hamburger = document.getElementById('hamburger');
    const sbNav   = document.getElementById('sbNav');
    const pages   = document.querySelectorAll('.page');
    const themeToggle = document.getElementById('themeToggle');
    const sysToggle   = document.getElementById('sysToggle');
    const themeBtn    = document.getElementById('themeBtn');
    const themeIco    = document.getElementById('themeIco');
 
    // ── THEME ──
    const sysDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
    function applyTheme(dark) {
    html.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (themeToggle) themeToggle.checked = dark;
    if (themeIco) themeIco.innerHTML = dark
        ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
        : '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>';
    // Only call drawCharts if it's already defined
    if (typeof window.drawCharts === 'function') setTimeout(window.drawCharts, 80);
}
    function loadTheme() {
        const follow = localStorage.getItem('follow-sys') !== 'false';
        const manual = localStorage.getItem('manual-theme');
        if (sysToggle) sysToggle.checked = follow;
        if (!follow && manual) { html.setAttribute('data-theme-manual',''); applyTheme(manual==='dark'); }
        else { html.removeAttribute('data-theme-manual'); applyTheme(sysDark()); }
    }
    function saveTheme() {
        const follow = sysToggle ? sysToggle.checked : true;
        localStorage.setItem('follow-sys', follow ? 'true' : 'false');
        if (!follow) {
            const dark = themeToggle ? themeToggle.checked : true;
            localStorage.setItem('manual-theme', dark ? 'dark' : 'light');
            html.setAttribute('data-theme-manual',''); applyTheme(dark);
        } else {
            localStorage.removeItem('manual-theme');
            html.removeAttribute('data-theme-manual'); applyTheme(sysDark());
        }
    }
    themeToggle?.addEventListener('change', () => { if(sysToggle) sysToggle.checked=false; saveTheme(); });
    sysToggle?.addEventListener('change', saveTheme);
    themeBtn?.addEventListener('click', () => {
        const dark = html.getAttribute('data-theme')==='dark';
        if(sysToggle) sysToggle.checked=false;
        if(themeToggle) themeToggle.checked=!dark;
        saveTheme();
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if(localStorage.getItem('follow-sys')!=='false') applyTheme(e.matches);
    });
    loadTheme();
 
    // ── NAVIGATION ──
    function goto(page) {
        pages.forEach(p => p.classList.remove('active'));
        const t = document.getElementById('page-'+page);
        if (t) t.classList.add('active');
        sbNav.querySelectorAll('a').forEach(a => a.classList.remove('active'));
        sbNav.querySelector(`a[data-page="${page}"]`)?.classList.add('active');
        if (window.innerWidth <= 768) closeSb();
        if (page==='insights'||page==='dashboard') setTimeout(drawCharts,120);
        if (page==='inbox') setupInboxFromUsers();
    }
 
    sbNav.addEventListener('click', e => {
        const a = e.target.closest('a[data-page]');
        if (!a) return; e.preventDefault(); goto(a.dataset.page);
    });
    document.addEventListener('click', e => {
        const a = e.target.closest('[data-page]');
        if (!a || a.closest('#sbNav')) return; e.preventDefault(); goto(a.dataset.page);
    });
 
    // ── SIDEBAR MOBILE ──
    function openSb() { sidebar.classList.add('open'); sbOverlay.classList.add('show'); document.body.style.overflow='hidden'; }
    function closeSb() { sidebar.classList.remove('open'); sbOverlay.classList.remove('show'); document.body.style.overflow=''; }
    hamburger?.addEventListener('click', () => sidebar.classList.contains('open') ? closeSb() : openSb());
    sbOverlay?.addEventListener('click', closeSb);
    document.addEventListener('keydown', e => { if(e.key==='Escape') closeSb(); });
    window.addEventListener('resize', () => { if(window.innerWidth>768) closeSb(); });
 
    // ── SIDEBAR COLLAPSE ──
    const sbCollapseBtn = document.getElementById('sbCollapseBtn');
    function setSidebarCollapsed(state, persist=true) {
        if (!sidebar) return;
        sidebar.classList.toggle('collapsed', state);
        if (persist) localStorage.setItem('sidebar-collapsed', state ? '1' : '0');
    }
    sbCollapseBtn?.addEventListener('click', () => setSidebarCollapsed(!sidebar.classList.contains('collapsed')));
    try { if(localStorage.getItem('sidebar-collapsed')==='1') setSidebarCollapsed(true,false); } catch(e){}
 
    // ── DROPDOWNS ──
    function toggleDD(el) {
        const a = el.classList.contains('active');
        document.querySelectorAll('.dd.active').forEach(d=>d.classList.remove('active'));
        if (!a) el.classList.add('active');
    }
    document.getElementById('notifBtn')?.addEventListener('click', e => { e.stopPropagation(); toggleDD(document.getElementById('ddNotif')); });
    document.getElementById('profileBtn')?.addEventListener('click', e => { e.stopPropagation(); toggleDD(document.getElementById('ddProfile')); });
    document.addEventListener('click', () => document.querySelectorAll('.dd.active').forEach(d=>d.classList.remove('active')));
 
    // ── SIGN OUT ──
    document.querySelectorAll('.dd-menu a').forEach(a => {
    if (a.textContent.trim().includes('Sign Out')) {
        a.addEventListener('click', async e => {
            e.preventDefault();
            e.stopPropagation();
            if (unsubMessages) unsubMessages();
            await signOut(auth);
            window.location.replace('login.html');
        });
    }
});
    
    // Also wire the actual sign out link in dropdown
    document.querySelectorAll('.dd-menu a').forEach(a => {
        if (a.textContent.includes('Sign Out')) {
            a.addEventListener('click', async e => {
                e.preventDefault();
                if (unsubMessages) unsubMessages();
                await signOut(auth);
                window.location.replace('login.html');
            });
        }
    });
 
    // ── INBOX — wire real messages with client list ──
    function setupInboxFromUsers() {
        const clients = _users.filter(u => u.role === 'client');
        const convos = clients.map(u => ({
            uid: u.uid || u.id,
            name: u.name || u.email.split('@')[0],
            init: (u.name || u.email).slice(0,2).toUpperCase(),
            email: u.email,
            online: false
        }));
 
        const list = document.getElementById('convoList');
        if (!list) return;
        if (!convos.length) {
            list.innerHTML = '<div style="padding:16px;font-size:12.5px;color:var(--t3);">No clients yet. They appear here once they log in via magic link.</div>';
            return;
        }
        list.innerHTML = convos.map(c => `
            <div class="convo" data-uid="${c.uid}" data-name="${c.name}" data-init="${c.init}">
                <div class="cav">${c.init}<span class="cav-dot off"></span></div>
                <div class="cinfo">
                    <div class="ctop"><span class="cn">${c.name}</span></div>
                    <div class="cprev">${c.email}</div>
                </div>
            </div>`).join('');
 
        list.querySelectorAll('.convo').forEach(item => {
            item.addEventListener('click', function() {
                list.querySelectorAll('.convo').forEach(i=>i.classList.remove('active'));
                this.classList.add('active');
                const uid  = this.dataset.uid;
                const name = this.dataset.name;
                const init = this.dataset.init;
                document.getElementById('chatEmpty').style.display = 'none';
                const co = document.getElementById('chatOpen');
                co.style.display = 'flex';
                co.style.flexDirection = 'column';
                document.getElementById('chatCav').textContent  = init;
                document.getElementById('chatName').textContent = name;
                document.getElementById('chatStatus').textContent = '⚫ Offline';
                loadAdminMessages(uid, name, init);
            });
        });
    }
 
    // ── MESSENGER SEND ──
    document.getElementById('sendBtn')?.addEventListener('click', adminSend);
    document.getElementById('msgInput')?.addEventListener('keydown', e => { if(e.key==='Enter') adminSend(); });
 
    // ── QUICK ACTIONS ──
    bindQuickActions();
 
    // ── CHARTS ──
    function gc() {
        const s = getComputedStyle(html);
        return {
            grid: s.getPropertyValue('--cg').trim(),
            line: s.getPropertyValue('--cl').trim(),
            fill: s.getPropertyValue('--cf').trim(),
            bar:  s.getPropertyValue('--cb').trim(),
            bar2: s.getPropertyValue('--cb2').trim(),
            muted:s.getPropertyValue('--t4').trim()
        };
    }
    function drawLine(id, data, labels) {
        const el=document.getElementById(id); if(!el) return;
        const ctx=el.getContext('2d'), dpr=devicePixelRatio||1;
        const w=el.getBoundingClientRect().width||400, h=210;
        el.width=w*dpr; el.height=h*dpr; el.style.width=w+'px'; el.style.height=h+'px';
        ctx.scale(dpr,dpr); ctx.clearRect(0,0,w,h);
        const c=gc(), p={t:14,r:20,b:26,l:38}, pw=w-p.l-p.r, ph=h-p.t-p.b;
        const max=Math.max(...data)*1.2, xs=pw/(labels.length-1);
        for(let i=0;i<=5;i++){
            const y=p.t+(ph/5)*i;
            ctx.strokeStyle=c.grid; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(p.l,y); ctx.lineTo(w-p.r,y); ctx.stroke();
            ctx.fillStyle=c.muted; ctx.font='10px DM Sans,sans-serif'; ctx.textAlign='right';
            ctx.fillText(Math.round(max-(max/5)*i).toLocaleString(),p.l-5,y+4);
        }
        ctx.fillStyle=c.muted; ctx.font='10px DM Sans,sans-serif'; ctx.textAlign='center';
        labels.forEach((l,i)=>ctx.fillText(l,p.l+xs*i,h-p.b+13));
        ctx.beginPath(); data.forEach((d,i)=>{ const x=p.l+xs*i,y=p.t+ph-((d/max)*ph); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
        ctx.lineTo(p.l+xs*(data.length-1),p.t+ph); ctx.lineTo(p.l,p.t+ph); ctx.closePath(); ctx.fillStyle=c.fill; ctx.fill();
        ctx.beginPath(); data.forEach((d,i)=>{ const x=p.l+xs*i,y=p.t+ph-((d/max)*ph); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
        ctx.strokeStyle=c.line; ctx.lineWidth=2.5; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.stroke();
        data.forEach((d,i)=>{ const x=p.l+xs*i,y=p.t+ph-((d/max)*ph); ctx.beginPath(); ctx.arc(x,y,3.5,0,Math.PI*2); ctx.fillStyle=c.line; ctx.fill(); });
    }
    function drawBar(id, data, labels) {
        const el=document.getElementById(id); if(!el) return;
        const ctx=el.getContext('2d'), dpr=devicePixelRatio||1;
        const w=el.getBoundingClientRect().width||400, h=210;
        el.width=w*dpr; el.height=h*dpr; el.style.width=w+'px'; el.style.height=h+'px';
        ctx.scale(dpr,dpr); ctx.clearRect(0,0,w,h);
        const c=gc(), p={t:14,r:14,b:26,l:34}, pw=w-p.l-p.r, ph=h-p.t-p.b;
        const max=Math.max(...data)*1.15, gap=pw/data.length, bw=Math.min(gap*.65,46);
        for(let i=0;i<=5;i++){
            const y=p.t+(ph/5)*i;
            ctx.strokeStyle=c.grid; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(p.l,y); ctx.lineTo(w-p.r,y); ctx.stroke();
            ctx.fillStyle=c.muted; ctx.font='10px DM Sans,sans-serif'; ctx.textAlign='right';
            ctx.fillText(Math.round(max-(max/5)*i),p.l-4,y+4);
        }
        data.forEach((d,i)=>{
            const x=p.l+gap*i+(gap-bw)/2, bh=(d/max)*ph, y=p.t+ph-bh;
            const gr=ctx.createLinearGradient(x,y,x,p.t+ph); gr.addColorStop(0,c.bar); gr.addColorStop(1,c.bar2);
            ctx.fillStyle=gr; ctx.beginPath();
            const r=4; ctx.moveTo(x+r,y); ctx.lineTo(x+bw-r,y); ctx.quadraticCurveTo(x+bw,y,x+bw,y+r);
            ctx.lineTo(x+bw,p.t+ph); ctx.lineTo(x,p.t+ph); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath(); ctx.fill();
        });
        ctx.fillStyle=c.muted; ctx.font='10px DM Sans,sans-serif'; ctx.textAlign='center';
        labels.forEach((l,i)=>ctx.fillText(l,p.l+gap*i+gap/2,h-p.b+13));
    }
    window.drawCharts = function() {
        const mo=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        drawLine('lineChart',[4200,5800,5100,7200,8900,10200,11500,13800,15200,16800,19100,21000],mo);
        // Build bar chart from real category counts
        const cats = ['Branding','Poster','Logo','Social','Print','Other'];
        const catCounts = cats.map(cat => _designs.filter(d => (d.category||'').toLowerCase()===cat.toLowerCase()).length || 0);
        drawBar('barChart', catCounts.some(v=>v>0) ? catCounts : [1,1,1,1,1,1], cats);
        drawLine('aLineChart',[3800,5200,4900,6800,8500,9700,11200,13500,14800,16400,18800,20500],mo);
        drawBar('aBarChart',[42,38,55,29,48,52,35,61],['Web','Mobile','Brand','UI/UX','Motion','3D','Print','Other']);
    };
    setTimeout(drawCharts, 300);
    let rt; window.addEventListener('resize',()=>{ clearTimeout(rt); rt=setTimeout(drawCharts,250); });
 
    // ── KEYBOARD SHORTCUTS ──
    document.addEventListener('keydown', e => {
        if(e.ctrlKey||e.metaKey||e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
        const k={'1':'dashboard','2':'designs','3':'users','4':'insights','5':'inbox','6':'assets','7':'showcase','8':'settings','9':'preview'};
        if(k[e.key]){ e.preventDefault(); goto(k[e.key]); }
    });
}
