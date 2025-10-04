/* script.js — final rebuilt version
   - Uses Firebase Realtime DB
   - Keeps original login layout unchanged
   - Realtime sync for users, paid status, vault, gallery
   - Data persists across logout/refresh and across devices
*/

/* ---------- Firebase init (v8) ---------- */
/* Full config used for reliable connection (includes apiKey etc) */
const firebaseConfig = {
  apiKey: "AIzaSyA0vxhI7QEvy8qdoDpJUK-peIU6KcE_NcE",
  authDomain: "vignaraja-b2a5e.firebaseapp.com",
  databaseURL: "https://vignaraja-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "vignaraja-b2a5e",
  storageBucket: "vignaraja-b2a5e.appspot.com",
  messagingSenderId: "631838687381",
  appId: "1:631838687381:web:9296960a10b3c04bde5b9c",
  measurementId: "G-WX8NP15HYZ"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const rootRef = db.ref('appData'); // everything under appData

/* ---------- Local state ---------- */
let currentUser = null;    // username string (e.g. "Prasad") or "admin"
let isAdmin = false;

/* Default structure if DB empty */
async function ensureInitialStructure() {
  const snap = await rootRef.once('value');
  if (!snap.exists()) {
    await rootRef.set({
      users: {},
      paid: {},
      ganeshaImages: {},
      vaultAmount: 0
    });
  }
}

/* ---------- Splash -> show login ---------- */
window.addEventListener('load', async () => {
  // ensure DB structure
  try { await ensureInitialStructure(); } catch (e) { console.warn('DB init error', e); }

  // hide splash after 5s and show login
  setTimeout(() => {
    const splash = document.getElementById('splashScreen');
    if (splash) splash.classList.add('hidden');
    document.getElementById('loginPage').classList.remove('hidden');
  }, 5000);

  // wire buttons
  document.getElementById('memberLoginBtn').addEventListener('click', login);
  document.getElementById('adminLoginBtn').addEventListener('click', adminLogin);
  document.getElementById('menuBtn').addEventListener('click', toggleSideMenu);
});

/* ---------- Helpers ---------- */
function $(id){ return document.getElementById(id); }
function showMsg(text){ const el = $('loginMsg'); if(el) el.textContent = text; }

/* ---------- Login/Register (normal user) ---------- */
async function login() {
  showMsg('');
  const name = $('nameInput').value.trim();
  const password = $('passwordInput').value.trim();
  const phone = $('phoneInput').value.trim();
  const imgInput = $('profileImgInput');

  if (!name || !password) { showMsg('Enter name and password'); return; }

  const userRef = rootRef.child('users').child(name);
  const snap = await userRef.once('value');

  if (snap.exists()) {
    // existing user -> verify password
    const data = snap.val();
    if (data.password === password) {
      currentUser = name;
      isAdmin = false;
      showApp();
    } else {
      showMsg('❌ Incorrect password!');
    }
    return;
  }

  // new user -> register
  if (!/^[0-9]{10}$/.test(phone)) { showMsg('Enter valid 10-digit mobile number'); return; }
  if (!imgInput.files[0]) { showMsg('Upload profile image'); return; }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const imgData = e.target.result;
    const userObj = {
      name: name,
      password: password,
      phone: phone,
      img: imgData,
      paid: false,
      registeredAt: Date.now()
    };
    await userRef.set(userObj);
    // also set paid map for quick lookups
    await rootRef.child('paid').child(name).set(false);
    showMsg('✅ Registered! Now login with your credentials.');
  };
  reader.readAsDataURL(imgInput.files[0]);
}

/* ---------- Admin login ---------- */
async function adminLogin() {
  const user = $('adminUser').value.trim();
  const pass = $('adminPass').value.trim();
  showMsg('');
  if (user === 'vignaraja' && pass === 'Pracx99') {
    currentUser = 'vignaraja';
    isAdmin = true;
    showApp();
  } else {
    showMsg('❌ Invalid admin credentials!');
  }
}

/* ---------- Show app after successful login ---------- */
function showApp() {
  $('loginPage').classList.add('hidden');
  $('app').classList.remove('hidden');

  // show avatar if user is normal user
  const avatarEl = $('profileAvatar');
  if (!isAdmin && currentUser) {
    rootRef.child('users').child(currentUser).child('img').once('value').then(snap => {
      if (snap.exists()) {
        avatarEl.style.backgroundImage = `url(${snap.val()})`;
        avatarEl.classList.remove('hidden');
      } else avatarEl.classList.add('hidden');
    });
  } else {
    avatarEl.classList.add('hidden');
  }

  // show admin tools in side menu if admin
  toggleAdminPanel(isAdmin);

  // attach realtime listeners to update UI live
  attachRealtimeListeners();
  startCountdown();
}

/* ---------- Realtime listeners ---------- */
function attachRealtimeListeners() {
  // users list changes
  rootRef.child('users').on('value', snapshot => {
    const users = snapshot.val() || {};
    renderMembers(users);
  });

  // paid map changes — compute vault also
  rootRef.child('paid').on('value', snapshot => {
    const paidMap = snapshot.val() || {};
    computeAndShowVault(paidMap);
  });

  // ganesha gallery updates
  rootRef.child('ganeshaImages').on('value', snap => {
    const imgs = snap.val() || {};
    renderGallery(imgs);
  });

  // explicit vaultAmount override
  rootRef.child('vaultAmount').on('value', snap => {
    const override = snap.val();
    if (override !== null && override !== undefined) {
      // show override
      $('totalVault').textContent = String(override);
    } else {
      // computed vault will show via paid listener
    }
  });
}

/* ---------- Render members (no undefined names) ---------- */
function renderMembers(usersObj) {
  const list = $('membersList');
  list.innerHTML = '';
  // usersObj keys are usernames — use keys for display (guaranteed)
  const users = usersObj || {};
  // sort by registration time (optional)
  const names = Object.keys(users).sort((a,b) => {
    const aa = users[a]?.registeredAt || 0;
    const bb = users[b]?.registeredAt || 0;
    return aa - bb;
  });

  names.forEach(name => {
    const u = users[name];
    if (!u) return;
    const paidStatus = !!u.paid;
    const li = document.createElement('li');
    li.className = 'member';
    li.innerHTML = `
      <div class="left">
        <img src="${u.img || ''}" alt="${name}">
        <div style="text-align:left">
          <div style="font-weight:700">${name}</div>
          <div style="font-size:12px;color:#666">${u.phone || ''}</div>
        </div>
      </div>
      <div class="right">
        <div class="status ${paidStatus ? 'paid' : 'pending'}">${paidStatus ? 'Paid ✅' : 'Pending ❗'}</div>
        ${isAdmin ? `<button class="btn green" onclick="adminTogglePaid('${name}', ${paidStatus})">${paidStatus ? 'Set Pending' : 'Mark Paid'}</button>
                     <button class="btn red" onclick="adminDeleteUser('${name}')">Delete</button>` : ''}
      </div>
    `;
    list.appendChild(li);
  });
}

/* ---------- Compute vault from paid map (unless override present) ---------- */
async function computeAndShowVault(paidMap) {
  const paidEntries = paidMap || {};
  const paidCount = Object.values(paidEntries).filter(v => v).length;
  const computed = paidCount * 250;

  // check override
  const snap = await rootRef.child('vaultAmount').once('value');
  const override = snap.exists() ? snap.val() : null;
  const show = (override !== null && override !== undefined) ? override : computed;
  $('totalVault').textContent = String(show);
}

/* ---------- Admin actions ---------- */
async function adminTogglePaid(name, currentStatus) {
  if (!isAdmin) { alert('Admin only'); return; }
  // Update both users/{name}/paid and paid/{name}
  await rootRef.child('users').child(name).update({ paid: !currentStatus });
  await rootRef.child('paid').child(name).set(!currentStatus);
}

window.adminTogglePaid = adminTogglePaid;

async function adminDeleteUser(name) {
  if (!isAdmin) { alert('Admin only'); return; }
  if (!confirm(`Delete user ${name}? This removes their record.`)) return;
  await rootRef.child('users').child(name).remove();
  await rootRef.child('paid').child(name).remove();
}

window.adminDeleteUser = adminDeleteUser;

async function adminSetVault() {
  if (!isAdmin) { alert('Admin only'); return; }
  const val = Number(prompt('Enter explicit vault amount (leave blank to cancel):'));
  if (!isNaN(val)) {
    await rootRef.child('vaultAmount').set(val);
    alert('Vault amount set to ₹' + val);
  } else alert('Invalid number');
}

window.adminSetVault = adminSetVault;

async function adminMarkAllPaid() {
  if (!isAdmin) return;
  const usersSnap = await rootRef.child('users').once('value');
  const users = usersSnap.val() || {};
  const updates = {};
  Object.keys(users).forEach(name => {
    updates['paid/' + name] = true;
    updates['users/' + name + '/paid'] = true;
  });
  await rootRef.update(updates);
}

async function adminMarkAllPending() {
  if (!isAdmin) return;
  const usersSnap = await rootRef.child('users').once('value');
  const users = usersSnap.val() || {};
  const updates = {};
  Object.keys(users).forEach(name => {
    updates['paid/' + name] = false;
    updates['users/' + name + '/paid'] = false;
  });
  await rootRef.update(updates);
}

/* ---------- Admin delete user (button) ---------- */
async function adminDeleteUserPrompt() {
  if (!isAdmin) return;
  const name = prompt('Enter user name to delete:');
  if (name) await adminDeleteUser(name);
}
window.adminDeleteUserPrompt = adminDeleteUserPrompt;

/* ---------- User self-delete ---------- */
async function deleteMyAccount() {
  if (!currentUser || isAdmin) { alert('Only normal users can delete their account from here'); return; }
  if (!confirm('Delete your account permanently?')) return;
  await rootRef.child('users').child(currentUser).remove();
  await rootRef.child('paid').child(currentUser).remove();
  logout();
}

/* ---------- Gallery upload & render ---------- */
function openGalleryUpload() {
  if (!currentUser) { alert('Please login first'); return; }
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const key = Date.now().toString();
      await rootRef.child('ganeshaImages').child(key).set(ev.target.result);
    };
    reader.readAsDataURL(f);
  };
  input.click();
}

function openGallery() {
  // open side menu and show gallery
  document.getElementById('sideMenu').classList.remove('hidden');
  renderGalleryFromDB();
}

async function renderGalleryFromDB() {
  const snap = await rootRef.child('ganeshaImages').once('value');
  const gallery = $('ganeshaGallery');
  gallery.innerHTML = '';
  if (!snap.exists()) return;
  const imgs = snap.val();
  Object.keys(imgs).sort().forEach(k => {
    const img = document.createElement('img');
    img.src = imgs[k];
    img.style.width = '100%';
    img.style.borderRadius = '8px';
    img.style.marginBottom = '6px';
    gallery.appendChild(img);
    if (isAdmin) {
      const del = document.createElement('button');
      del.textContent = '❌';
      del.className = 'btn';
      del.style.marginBottom = '8px';
      del.onclick = async () => { await rootRef.child('ganeshaImages').child(k).remove(); };
      gallery.appendChild(del);
    }
  });
}

function renderGallery(imgsObj) {
  // called via realtime listener
  const gallery = $('ganeshaGallery');
  gallery.innerHTML = '';
  const imgs = imgsObj || {};
  Object.keys(imgs).sort().forEach(k => {
    const img = document.createElement('img');
    img.src = imgs[k];
    img.style.width = '100%';
    img.style.borderRadius = '8px';
    img.style.marginBottom = '6px';
    gallery.appendChild(img);
  });
}

/* ---------- Compute & display vault on load as well ---------- */
async function computeAndShowVaultOnLoad() {
  const paidSnap = await rootRef.child('paid').once('value');
  computeAndShowVault(paidSnap.val() || {});
}

/* ---------- Menu handling ---------- */
function toggleSideMenu() {
  const side = $('sideMenu');
  if (side.classList.contains('hidden')) side.classList.remove('hidden');
  else side.classList.add('hidden');
}
function goHome() { $('sideMenu').classList.add('hidden'); window.scrollTo({top:0, behavior:'smooth'}); }
function viewDates() { alert('Important Dates:\n- 3rd of every month: Savings\n- 14 September 2026: Special Event'); }

/* ---------- Logout ---------- */
function logout() {
  currentUser = null;
  isAdmin = false;
  // remove listeners to avoid double-binding; simplest is to reload UI and re-attach on login
  rootRef.off();
  // hide app, show login page
  $('app').classList.add('hidden');
  $('loginPage').classList.remove('hidden');
  // keep data in DB — not removing anything
}

/* ---------- Toggle admin panel visibility ---------- */
function toggleAdminPanel(show) {
  const el = $('adminPanel');
  if (!el) return;
  if (show) el.classList.remove('hidden');
  else el.classList.add('hidden');
}

/* ---------- Helper wrappers to allow onclick inline from HTML if needed ---------- */
window.togglePassword = function() {
  const p = $('passwordInput');
  if (!p) return;
  p.type = p.type === 'password' ? 'text' : 'password';
};
window.toggleSideMenu = toggleSideMenu;
window.goHome = goHome;
window.viewDates = viewDates;
window.openGallery = openGallery;
window.openGalleryUpload = openGalleryUpload;
window.deleteMyAccount = deleteMyAccount;
window.logout = logout;
window.adminSetVault = adminSetVault;
window.adminMarkAllPaid = adminMarkAllPaid;
window.adminMarkAllPending = adminMarkAllPending;
window.adminDeleteUser = adminDeleteUser;
window.adminDeleteUserPrompt = adminDeleteUserPrompt;

/* ---------- Countdown timer ---------- */
function startCountdown() {
  const timerEl = $('timer');
  const eventTime = new Date('September 14, 2026 00:00:00').getTime();
  setInterval(() => {
    const now = Date.now();
    const diff = eventTime - now;
    if (diff <= 0) { timerEl.textContent = 'Event Passed'; return; }
    const days = Math.floor(diff / (1000*60*60*24));
    const hours = Math.floor((diff % (1000*60*60*24)) / (1000*60*60));
    const mins = Math.floor((diff % (1000*60*60)) / (1000*60));
    timerEl.textContent = `${days}d ${hours}h ${mins}m left`;
  }, 1000);
}

/* ---------- initial vault compute on script load ---------- */
computeAndShowVaultOnLoad();
