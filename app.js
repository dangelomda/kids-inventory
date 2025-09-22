// app.js — Inventário Kids (invite-only + roles + CRUD + fotos + admin)
// ---------------------------------------------------------------
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs';

/* =================================================
   SUPABASE
   ================================================= */
const SUPABASE_URL = "https://msvmsaznklubseypxsbs.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zdm1zYXpua2x1YnNleXB4c2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyMzQ4MzQsImV4cCI6MjA3MzgxMDgzNH0.ZGDD31UVRtwUEpDBkGg6q_jgV8JD_yXqWtuZ_1dprrw";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* =================================================
   DOM
   ================================================= */
const itemForm  = document.getElementById('itemForm');
const itemList  = document.getElementById('itemList');
const submitButton = document.getElementById('submitButton');
const searchInput  = document.getElementById('searchInput');
const exportButton = document.getElementById('exportButton');
const visitorHint  = document.getElementById('visitorHint');
const adminPanel   = document.getElementById('adminPanel');

const inputPhotoCamera  = document.getElementById("itemPhotoCamera");
const inputPhotoGallery = document.getElementById("itemPhotoGallery");
const btnUseCamera  = document.getElementById("btnUseCamera");
const btnUseGallery = document.getElementById("btnUseGallery");

/* Badge / Modais */
const userBadge     = document.getElementById('userBadge');
const userBadgeText = document.getElementById('userBadgeText');
const userBadgeDot  = document.getElementById('userBadgeDot');
const fabAdmin          = document.getElementById('fabAdmin');
const loginModal        = document.getElementById('loginModal');
const accountModal      = document.getElementById('accountModal');
const loginButton       = document.getElementById('loginButton');
const closeModalBtn     = document.getElementById('closeModal');
const logoutButton      = document.getElementById('logoutButton');
const closeAccountModal = document.getElementById('closeAccountModal');
const accountTitle      = document.getElementById('accountTitle');
const accountSubtitle   = document.getElementById('accountSubtitle');
const goAdminBtn        = document.getElementById('goAdminBtn');

/* Admin panel */
const profilesBody = document.getElementById('profilesBody');
const addUserBtn   = document.getElementById('addUserBtn');
const newUserEmail = document.getElementById('newUserEmail');

/* =================================================
   ESTADO
   ================================================= */
let editingId = null;
let editingPhotoUrl = null;
let currentUser = null;
let currentRole = 'visitor';
let currentActive = false; // só membro/admin com active=TRUE podem escrever

const isLoggedIn = () => !!currentUser;
const canWrite   = () => currentActive && ['member','admin'].includes(currentRole);
const isAdmin    = () => currentActive && currentRole === 'admin';

/* =================================================
   UTILS
   ================================================= */
const openModal  = (id) => document.getElementById(id)?.classList.add('show');
const closeModal = (id) => document.getElementById(id)?.classList.remove('show');
const canon = (s) => (s||'').trim().toLowerCase();

function setBadge(email, role, active) {
  const r = (role || 'visitor').toLowerCase();
  const tag = active ? r.toUpperCase() : 'VISITOR';
  userBadgeText.textContent = email ? `${email} • ${tag}` : 'VISITOR';
  userBadgeDot.classList.remove('visitor','member','admin');
  userBadgeDot.classList.add(active ? r : 'visitor');
}

async function compressImage(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => resolve(new File([blob], file.name.replace(/\.[^.]+$/, '') + ".jpg", { type: "image/jpeg" })),
        "image/jpeg", quality
      );
    };
    img.onerror = reject;
  });
}

function pathFromPublicUrl(url) {
  try {
    const u = new URL(url);
    const marker = '/object/public/';
    const i = u.pathname.indexOf(marker);
    if (i === -1) return null;
    let tail = u.pathname.slice(i + marker.length); // ex: item-photos/xxx.jpg
    if (!tail.startsWith('item-photos/')) return null;
    return tail.replace('item-photos/', '');        // ex: xxx.jpg
  } catch {
    return null;
  }
}

/* =================================================
   AUTH  (INVITE-ONLY: sem insert automático)
   ================================================= */
async function refreshAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user || null;

  currentRole = 'visitor';
  currentActive = false;

  if (currentUser?.email) {
    const email = canon(currentUser.email);

    // 1) Procurar convite existente por e-mail (NÃO INSERE AUTOMÁTICO)
    const { data: prof, error } = await supabase
      .from('profiles')
      .select('id, email, role, active')
      .eq('email', email)
      .maybeSingle();

    if (!error && prof) {
      // 2) Se foi convidado e ainda não tem id, faz o bind do primeiro login
      if (!prof.id) {
        await supabase.from('profiles')
          .update({ id: currentUser.id })
          .eq('email', email);
      }
      // 3) Só aplica permissão se active=TRUE
      currentRole = prof.role || 'visitor';
      currentActive = !!prof.active;
    }
  }
  updateAuthUI();
}

function updateAuthUI() {
  // aviso de somente leitura
  if (visitorHint) visitorHint.style.display = canWrite() ? 'none' : 'block';
  // botão painel admin
  if (goAdminBtn)  goAdminBtn.style.display  = isAdmin() ? 'block' : 'none';
  // badge
  setBadge(currentUser?.email || null, currentRole, currentActive);
}

/* =================================================
   ITENS (CRUD + fotos)
   ================================================= */
async function loadItems(filter = "") {
  let q = supabase.from('items').select('*').order('created_at', { ascending: false });
  if (filter) q = q.ilike('name', `%${filter}%`);
  const { data, error } = await q;

  itemList.innerHTML = '';
  if (error) { itemList.innerHTML = '<p>Erro ao carregar itens.</p>'; return; }
  if (!data?.length) { itemList.innerHTML = '<p>Nenhum item encontrado.</p>'; return; }

  data.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <img src="${item.photo_url || ''}" alt="${item.name}" ${item.photo_url ? '' : 'style="display:none"'} />
      <h3>${item.name}</h3>
      <p><b>Qtd:</b> ${item.quantity}</p>
      <p><b>Local:</b> ${item.location}</p>
      <div class="actions" style="${canWrite() ? '' : 'display:none'}">
        <button class="edit-btn" data-id="${item.id}">✏️ Editar</button>
        <button class="delete-btn" data-id="${item.id}">🗑️ Excluir</button>
      </div>
    `;
    const img = card.querySelector('img');
    img?.addEventListener('click', () => { if (item.photo_url) window.open(item.photo_url, "_blank"); });

    if (canWrite()) {
      card.querySelector('.edit-btn')?.addEventListener('click', () => editItem(item.id));
      card.querySelector('.delete-btn')?.addEventListener('click', () => deleteItem(item.id));
    }
    itemList.appendChild(card);
  });
}

itemForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!canWrite()) { openModal('loginModal'); return; }

  const name = document.getElementById('itemName').value.trim();
  const quantity = Number(document.getElementById('itemQuantity').value) || 0;
  const location = document.getElementById('itemLocation').value.trim();
  let file = inputPhotoCamera.files[0] || inputPhotoGallery.files[0] || null;

  submitButton.disabled = true;
  submitButton.textContent = editingId ? 'Salvando...' : 'Cadastrando...';

  try {
    let photo_url = null;
    if (editingId) {
      if (file) {
        file = await compressImage(file, 800, 0.7);
        const fileName = `${Date.now()}-${file.name}`;
        await supabase.storage.from('item-photos').upload(fileName, file);
        photo_url = `${SUPABASE_URL}/storage/v1/object/public/item-photos/${fileName}?v=${Date.now()}`;

        // remove a antiga se havia
        if (editingPhotoUrl) {
          const path = pathFromPublicUrl(editingPhotoUrl);
          if (path) await supabase.storage.from('item-photos').remove([path]);
        }
      } else {
        photo_url = editingPhotoUrl || null;
      }

      await supabase.from('items').update({ name, quantity, location, photo_url }).eq('id', editingId);
      editingId = null;
      editingPhotoUrl = null;
      submitButton.textContent = 'Cadastrar';
    } else {
      if (file) {
        file = await compressImage(file, 800, 0.7);
        const fileName = `${Date.now()}-${file.name}`;
        await supabase.storage.from('item-photos').upload(fileName, file);
        photo_url = `${SUPABASE_URL}/storage/v1/object/public/item-photos/${fileName}?v=${Date.now()}`;
      }
      await supabase.from('items').insert([{ name, quantity, location, photo_url }]);
      submitButton.textContent = 'Cadastrar';
    }

    itemForm.reset();
    inputPhotoCamera.value = ""; inputPhotoGallery.value = "";
    await loadItems();
  } catch (err) {
    console.error('Erro no cadastro/edição:', err);
    alert('Erro ao salvar. Verifique suas permissões.');
  } finally {
    submitButton.disabled = false;
  }
});

async function editItem(id) {
  if (!canWrite()) { openModal('loginModal'); return; }
  const { data } = await supabase.from('items').select('*').eq('id', id).single();
  document.getElementById('itemId').value = data.id;
  document.getElementById('itemName').value = data.name;
  document.getElementById('itemQuantity').value = data.quantity;
  document.getElementById('itemLocation').value = data.location;

  editingId = id;
  editingPhotoUrl = data.photo_url || null;
  submitButton.textContent = 'Salvar';
}

async function deleteItem(id) {
  if (!canWrite()) { openModal('loginModal'); return; }
  if (!confirm('Excluir este item?')) return;

  const { data: item } = await supabase.from('items').select('photo_url').eq('id', id).single();
  await supabase.from('items').delete().eq('id', id);

  if (item?.photo_url) {
    const path = pathFromPublicUrl(item.photo_url);
    if (path) await supabase.storage.from('item-photos').remove([path]);
  }

  await loadItems();
}

/* Busca & Export */
searchInput?.addEventListener('input', (e)=> loadItems(e.target.value.trim()));
exportButton?.addEventListener('click', async () => {
  const { data, error } = await supabase.from('items').select('*').order('created_at', { ascending: false });
  if (error || !data?.length) return alert('Nenhum item para exportar.');
  const rows = data.map(x => ({ Item:x.name, Quantidade:x.quantity, Local:x.location, Foto:x.photo_url||'Sem foto' }));
  const ws = XLSX.utils.json_to_sheet(rows), wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventário'); XLSX.writeFile(wb, 'inventario_kids.xlsx');
});

/* =================================================
   ADMIN (convidar/promover/ativar/desativar/remover)
   ================================================= */
async function loadProfiles() {
  profilesBody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, active, created_at')
    .order('created_at', { ascending: false });

  if (error) { profilesBody.innerHTML = `<tr><td colspan="5">Erro: ${error.message}</td></tr>`; return; }
  if (!data?.length) { profilesBody.innerHTML = '<tr><td colspan="5">Nenhum perfil.</td></tr>'; return; }

  profilesBody.innerHTML = '';
  data.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.email}</td>
      <td><span class="role-badge ${p.role}">${p.role}</span></td>
      <td>${p.active ? 'ATIVO' : 'INATIVO'}</td>
      <td>${new Date(p.created_at).toLocaleString()}</td>
      <td class="admin-row-actions">
        <button class="btn toggle">${p.active ? 'Desativar' : 'Ativar'}</button>
        <button class="btn promote">Promover a Admin</button>
        <button class="btn demote">Tornar Membro</button>
        <button class="btn delete">Remover</button>
      </td>
    `;

    tr.querySelector('.toggle').addEventListener('click', async () => {
      if (!isAdmin()) return alert('Acesso negado.');
      await supabase.from('profiles').update({ active: !p.active }).eq('email', p.email);
      loadProfiles();
    });

    tr.querySelector('.promote').addEventListener('click', async () => {
      if (!isAdmin()) return alert('Acesso negado.');
      await supabase.from('profiles').update({ role: 'admin', active: true }).eq('email', p.email);
      loadProfiles();
    });

    tr.querySelector('.demote').addEventListener('click', async () => {
      if (!isAdmin()) return alert('Acesso negado.');
      await supabase.from('profiles').update({ role: 'member', active: true }).eq('email', p.email);
      loadProfiles();
    });

    tr.querySelector('.delete').addEventListener('click', async () => {
      if (!isAdmin()) return alert('Acesso negado.');
      if (!confirm(`Remover ${p.email}?`)) return;
      await supabase.from('profiles').delete().eq('email', p.email);
      loadProfiles();
    });

    profilesBody.appendChild(tr);
  });
}

addUserBtn?.addEventListener('click', async () => {
  if (!isAdmin()) return alert('Apenas administradores.');
  const email = canon(newUserEmail.value);
  if (!email || !email.includes('@')) return alert('Informe um e-mail válido.');

  // convite explícito (unique por email no banco)
  const { error } = await supabase.from('profiles').insert([{ email, role: 'member', active: true }]);
  if (error && !String(error.message).includes('duplicate')) {
    alert('Erro: ' + error.message);
    return;
  }
  newUserEmail.value = '';
  loadProfiles();
});

/* =================================================
   LOGIN / LOGOUT / MODAIS
   ================================================= */
fabAdmin?.addEventListener('click', () => {
  if (!isLoggedIn()) openModal('loginModal');
  else {
    accountTitle.textContent   = 'Conta';
    accountSubtitle.textContent = `${currentUser.email} • ${(currentActive ? currentRole.toUpperCase() : 'VISITOR')}`;
    openModal('accountModal');
  }
});

userBadge?.addEventListener('click', () => fabAdmin?.click());

loginButton?.addEventListener('click', async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) alert('Erro no login: ' + error.message);
  else if (data?.url) window.location.href = data.url;
});

logoutButton?.addEventListener('click', async () => {
  await supabase.auth.signOut();      // <-- LOGOUT FUNCIONANDO
  currentUser = null;
  currentRole = 'visitor';
  currentActive = false;
  updateAuthUI();
  closeModal('accountModal');
  await loadItems();
});

closeModalBtn?.addEventListener('click', () => closeModal('loginModal'));
closeAccountModal?.addEventListener('click', () => closeModal('accountModal'));

goAdminBtn?.addEventListener('click', async () => {
  if (!isAdmin()) return alert('Acesso negado.');
  adminPanel.style.display = 'block';
  closeModal('accountModal');
  await loadProfiles();
});

/* =================================================
   INICIALIZAÇÃO
   ================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  await refreshAuth();
  await loadItems();
  supabase.auth.onAuthStateChange(async () => {
    await refreshAuth();
    await loadItems();
  });
});
btnUseCamera?.addEventListener('click', ()=> document.getElementById("itemPhotoCamera").click());
btnUseGallery?.addEventListener('click', ()=> document.getElementById("itemPhotoGallery").click());
