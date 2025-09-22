// app.js — Inventário Kids (versão final corrigida)
// -----------------------------------------------------------------------------
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs';

/* =================================================
   CONFIGURAÇÃO SUPABASE
   ================================================= */
const SUPABASE_URL = "https://msvmsaznklubseypxsbs.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zdm1zYXpua2x1YnNleXB4c2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyMzQ4MzQsImV4cCI6MjA3MzgxMDgzNH0.ZGDD31UVRtwUEpDBkGg6q_jgV8JD_yXqWtuZ_1dprrw";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* =================================================
   ELEMENTOS DO DOM
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

/* Badge / Modais / FAB */
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

/* Painel Admin */
const profilesBody = document.getElementById('profilesBody');
const addUserBtn   = document.getElementById('addUserBtn');
const newUserEmail = document.getElementById('newUserEmail');

/* =================================================
   ESTADO DA APLICAÇÃO
   ================================================= */
let editingId = null;
let currentUser = null;
let currentRole = 'visitor';
let currentActive = false;

const isLoggedIn = () => !!currentUser;
const canWrite   = () => currentActive && ['member','admin'].includes(currentRole);
const isAdmin    = () => currentActive && currentRole === 'admin';

/* =================================================
   FUNÇÕES UTILITÁRIAS
   ================================================= */
const openModal  = (id) => document.getElementById(id)?.classList.add('show');
const closeModal = (id) => document.getElementById(id)?.classList.remove('show');
const canon = (s) => (s||'').trim().toLowerCase();

function setBadge(email, role, active) {
  const r = (role || 'visitor').toLowerCase();
  const tag = active ? r.toUpperCase() : 'VISITOR';
  userBadgeText.textContent = email ? `${email} • ${tag}` : 'VISITOR';
  userBadgeDot.className = `dot ${active ? r : 'visitor'}`;
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
        (blob) => resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: "image/jpeg" })),
        "image/jpeg", quality
      );
    };
    img.onerror = reject;
  });
}

function pathFromPublicUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/');
    const idx = parts.indexOf('item-photos');
    if (idx >= 0 && idx < parts.length - 1) return parts.slice(idx + 1).join('/');
  } catch (e) { /* ignore */ }
  return null;
}

/* =================================================
   AUTENTICAÇÃO (CORRIGIDO: APENAS PARA CONVIDADOS)
   ================================================= */
async function refreshAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user || null;

  currentRole = 'visitor';
  currentActive = false;

  if (currentUser?.email) {
    const email = canon(currentUser.email);

    const { data: prof, error } = await supabase
      .from('profiles')
      .select('id, role, active')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error("Erro ao buscar perfil:", error.message);
    } else if (prof) {
      currentRole   = prof.role || 'visitor';
      currentActive = !!prof.active;
      if (!prof.id && currentUser.id) {
        await supabase.from('profiles').update({ id: currentUser.id }).eq('email', email);
      }
    }
  }
  updateAuthUI();
}

function updateAuthUI() {
  if (visitorHint) visitorHint.style.display = canWrite() ? 'none' : 'block';
  if (goAdminBtn)  goAdminBtn.style.display  = isAdmin() ? 'block' : 'none';
  setBadge(currentUser?.email || null, currentRole, currentActive);
}

/* =================================================
   ITENS (CRUD CORRIGIDO E ROBUSTO)
   ================================================= */
async function loadItems(filter = "") {
  let q = supabase.from('items').select('*').order('created_at', { ascending: false });
  if (filter) q = q.ilike('name', `%${filter}%`);
  const { data, error } = await q;

  itemList.innerHTML = '';
  if (error) { itemList.innerHTML = `<p>Erro ao carregar itens: ${error.message}</p>`; return; }
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
        <button class="edit-btn">✏️ Editar</button>
        <button class="delete-btn">🗑️ Excluir</button>
      </div>
    `;
    card.querySelector('img')?.addEventListener('click', () => { if (item.photo_url) window.open(item.photo_url, "_blank"); });
    if (canWrite()) {
      card.querySelector('.edit-btn')?.addEventListener('click', () => editItem(item));
      card.querySelector('.delete-btn')?.addEventListener('click', () => deleteItem(item));
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
  const file = inputPhotoCamera.files[0] || inputPhotoGallery.files[0] || null;

  const itemIdInput = document.getElementById('itemId');
  const currentPhotoUrl = itemIdInput?.dataset.currentPhotoUrl || null;
  const isEdit = !!editingId;

  submitButton.disabled = true;
  submitButton.textContent = isEdit ? 'Salvando...' : 'Cadastrando...';

  try {
    let photo_url = currentPhotoUrl;

    if (file) {
      const compressed = await compressImage(file, 800, 0.7);
      const fileName = `${Date.now()}-${compressed.name}`;
      const { data: up, error: upErr } = await supabase.storage.from('item-photos').upload(fileName, compressed);
      if (upErr) throw upErr;
      photo_url = `${SUPABASE_URL}/storage/v1/object/public/item-photos/${up.path}`;
    }

    const payload = { name, quantity, location, photo_url };

    if (isEdit) {
      const { error: updErr } = await supabase.from('items').update(payload).eq('id', editingId);
      if (updErr) throw updErr;

      if (file && currentPhotoUrl) {
        const oldPath = pathFromPublicUrl(currentPhotoUrl);
        if (oldPath) await supabase.storage.from('item-photos').remove([oldPath]);
      }
    } else {
      const { error: insErr } = await supabase.from('items').insert([payload]);
      if (insErr) throw insErr;
    }

    await loadItems();
    itemForm.reset();
  } catch (err) {
    console.error('Erro ao salvar item:', err);
    alert(`Erro ao salvar: ${err.message}`);
  } finally {
    editingId = null;
    if (itemIdInput) itemIdInput.dataset.currentPhotoUrl = '';
    submitButton.disabled = false;
    submitButton.textContent = 'Cadastrar';
    inputPhotoCamera.value = "";
    inputPhotoGallery.value = "";
  }
});

function editItem(item) {
  if (!canWrite()) { openModal('loginModal'); return; }
  document.getElementById('itemId').value = item.id;
  document.getElementById('itemName').value = item.name;
  document.getElementById('itemQuantity').value = item.quantity;
  document.getElementById('itemLocation').value = item.location;
  document.getElementById('itemId').dataset.currentPhotoUrl = item.photo_url || '';
  editingId = item.id;
  submitButton.textContent = "Salvar Alterações";
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteItem(item) {
  if (!canWrite()) { openModal('loginModal'); return; }
  if (!confirm(`Excluir "${item.name}"?`)) return;
  try {
    const { error: delErr } = await supabase.from('items').delete().eq('id', item.id);
    if (delErr) throw delErr;

    if (item.photo_url) {
      const path = pathFromPublicUrl(item.photo_url);
      if (path) {
        // CORREÇÃO: Usar um array de caminhos para o método .remove()
        await supabase.storage.from('item-photos').remove([path]);
      }
    }
    await loadItems();
  } catch (err) {
    console.error("Erro ao deletar:", err);
    alert(`Não foi possível deletar: ${err.message}`);
  }
}

/* Busca & Exportar */
searchInput?.addEventListener('input', (e)=> loadItems(e.target.value.trim()));
exportButton?.addEventListener('click', async () => {
  const { data, error } = await supabase.from('items').select('*').order('created_at', { ascending: false });
  if (error) return alert('Erro ao exportar.');
  if (!data?.length) return alert('Nenhum item para exportar.');
  const rows = data.map(x => ({ Item:x.name, Quantidade:x.quantity, Local:x.location, Foto:x.photo_url||'Sem foto' }));
  const ws = XLSX.utils.json_to_sheet(rows), wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventário'); XLSX.writeFile(wb, 'inventario_kids.xlsx');
});

/* =================================================
   PAINEL ADMIN
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

  const { error } = await supabase.from('profiles').insert([{ email, role: 'member', active: true }]);
  if (error && !String(error.message).toLowerCase().includes('duplicate')) {
    alert('Erro: ' + error.message);
    return;
  }
  newUserEmail.value = '';
  loadProfiles();
});

/* =================================================
   LOGIN / LOGOUT / MODAIS
   ================================================= */
const handleAuthClick = () => {
  if (!isLoggedIn()) {
    openModal('loginModal');
  } else {
    accountTitle.textContent   = 'Conta';
    accountSubtitle.textContent = `${currentUser.email} • ${(currentActive ? currentRole.toUpperCase() : 'VISITOR')}`;
    openModal('accountModal');
  }
};
fabAdmin?.addEventListener('click', handleAuthClick);
userBadge?.addEventListener('click', handleAuthClick);

loginButton?.addEventListener('click', async () => {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
});

logoutButton?.addEventListener('click', async () => {
  await supabase.auth.signOut();
});

closeModalBtn?.addEventListener('click', () => closeModal('loginModal'));
closeAccountModal?.addEventListener('click', () => closeModal('accountModal'));

goAdminBtn?.addEventListener('click', async () => {
  if (!isAdmin()) return alert('Acesso negado.');
  adminPanel.style.display = 'block';
  closeModal('accountModal');
  await loadProfiles();
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
});

/* =================================================
   INICIALIZAÇÃO
   ================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  btnUseCamera?.addEventListener('click', () => inputPhotoCamera.click());
  btnUseGallery?.addEventListener('click', () => inputPhotoGallery.click());

  await refreshAuth();
  await loadItems();

  supabase.auth.onAuthStateChange(async (event, session) => {
    await refreshAuth();
    await loadItems();
  });
});

