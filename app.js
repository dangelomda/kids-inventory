// app.js — Inventário Kids (versão oficial unificada, COMPLETA e corrigida)
// - Auth (Google) + profiles (role/active) + badge
// - Items com photo_key (sem lixo no storage)
// - Realtime estável (load com debounce)
// - Correções de freezing (finally em todas as operações)
// - Export para Excel

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs';

/* ================================
   SUPABASE
=================================== */
const SUPABASE_URL = "https://msvmsaznklubseypxsbs.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zdm1zYXpua2x1YnNleXB4c2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyMzQ4MzQsImV4cCI6MjA3MzgxMDgzNH0.ZGDD31UVRtwUEpDBkGg6q_jgV8JD_yXqWtuZ_1dprrw";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const BUCKET = 'item-photos';

/* ================================
   DOM
   (se algum id não existir no seu HTML, o código ignora com null-check)
=================================== */
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

/* ================================
   ESTADO
=================================== */
let editingId = null;
let currentUser = null;
let currentRole = 'visitor';
let currentActive = false;
let isSubmitting = false;
let currentSearch = '';

const isLoggedIn = () => !!currentUser;
const canWrite   = () => currentActive && ['member','admin'].includes(currentRole);
const isAdmin    = () => currentActive && currentRole === 'admin';

/* ================================
   HELPERS
=================================== */
const canon = (s) => (s||'').trim().toLowerCase();

function debounce(fn, wait = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

const openModal  = (id) => document.getElementById(id)?.classList.add('show');
const closeModal = (id) => document.getElementById(id)?.classList.remove('show');

function setBadge(email, role, active) {
  if (!userBadgeText || !userBadgeDot) return;
  const r = (role || 'visitor').toLowerCase();
  const tag = active ? r.toUpperCase() : 'VISITOR';
  userBadgeText.textContent = email ? `${email} • ${tag}` : 'VISITOR';
  userBadgeDot.className = `dot ${active ? r : 'visitor'}`;
}

/* ================================
   IMAGEM
=================================== */
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

function getSelectedFile() {
  return inputPhotoCamera?.files?.[0] || inputPhotoGallery?.files?.[0] || null;
}

/* ================================
   STORAGE helpers (usa photo_key)
=================================== */
function makeKey() {
  const rnd = crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${rnd}-${Date.now()}.jpg`;
}
function publicUrlFromKey(key) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return `${data.publicUrl}?v=${Date.now()}`; // cache-bust
}
async function uploadPhotoAndGetRefs(file) {
  const key = makeKey();
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, file);
  if (upErr) throw upErr;
  return { photo_key: key, photo_url: publicUrlFromKey(key) };
}
async function removeByKey(key) {
  if (!key) return;
  const { error } = await supabase.storage.from(BUCKET).remove([key]);
  if (error) console.warn('Falha ao remover do Storage:', key, error.message);
}

/* ================================
   AUTH
=================================== */
async function refreshAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user || null;
  currentRole = 'visitor';
  currentActive = false;

  if (currentUser?.email) {
    const email = canon(currentUser.email);
    const { data: prof, error } = await supabase
      .from('profiles')
      .select('role, active')
      .eq('email', email)
      .maybeSingle();

    if (!error && prof) {
      currentRole   = prof.role || 'visitor';
      currentActive = !!prof.active;
    } else if (error) {
      console.error("Erro ao buscar perfil:", error.message);
    }
  }
  updateAuthUI();
}

function updateAuthUI() {
  if (visitorHint) visitorHint.style.display = canWrite() ? 'none' : 'block';
  if (goAdminBtn)  goAdminBtn.style.display  = isAdmin() ? 'block' : 'none';
  setBadge(currentUser?.email || null, currentRole, currentActive);
}

/* ================================
   ITENS (CRUD) — com photo_key
=================================== */
async function _loadItems(filter = "") {
  let q = supabase.from('items').select('*').order('created_at', { ascending: false });
  if (filter) q = q.ilike('name', `%${filter}%`);
  const { data, error } = await q;

  if (!itemList) return;
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

// Debounce firme para não competir com eventos realtime
const loadItems = debounce((filter) => { currentSearch = filter || ''; _loadItems(currentSearch); }, 250);

itemForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!canWrite()) { openModal('loginModal'); return; }
  if (isSubmitting) return;
  isSubmitting = true;

  const name = document.getElementById('itemName').value.trim();
  const quantity = Number(document.getElementById('itemQuantity').value) || 0;
  const location = document.getElementById('itemLocation').value.trim();

  const idInput = document.getElementById('itemId');
  const isEdit = !!editingId;

  const currentPhotoKey = idInput?.dataset.currentPhotoKey || null;
  const fileRaw = getSelectedFile();

  // feedback
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = isEdit ? 'Salvando...' : 'Cadastrando...';
  }

  try {
    let payload = { name, quantity, location };

    if (fileRaw) {
      const file = await compressImage(fileRaw, 800, 0.7);
      const { photo_key, photo_url } = await uploadPhotoAndGetRefs(file);
      payload.photo_key = photo_key;
      payload.photo_url = photo_url;
    }

    if (isEdit) {
      const { error: updErr } = await supabase.from('items').update(payload).eq('id', editingId);
      if (updErr) {
        if (payload.photo_key) await removeByKey(payload.photo_key);
        throw updErr;
      }
      if (fileRaw && currentPhotoKey) await removeByKey(currentPhotoKey);
    } else {
      const { error: insErr } = await supabase.from('items').insert([payload]);
      if (insErr) {
        if (payload.photo_key) await removeByKey(payload.photo_key);
        throw insErr;
      }
    }

    itemForm.reset();
    if (inputPhotoCamera) inputPhotoCamera.value = "";
    if (inputPhotoGallery) inputPhotoGallery.value = "";
  } catch (err) {
    console.error('Erro ao salvar item:', err);
    alert(`Erro ao salvar: ${err.message || err}`);
  } finally {
    editingId = null;
    if (idInput) { idInput.dataset.currentPhotoKey = ''; idInput.dataset.currentPhotoUrl = ''; }
    if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Cadastrar'; }
    isSubmitting = false;
    loadItems(currentSearch); // debounced
  }
});

function editItem(item) {
  if (!canWrite()) { openModal('loginModal'); return; }
  document.getElementById('itemId').value = item.id;
  document.getElementById('itemId').dataset.currentPhotoKey = item.photo_key || '';
  document.getElementById('itemId').dataset.currentPhotoUrl = item.photo_url || '';
  document.getElementById('itemName').value = item.name;
  document.getElementById('itemQuantity').value = item.quantity;
  document.getElementById('itemLocation').value = item.location;
  editingId = item.id;
  if (submitButton) submitButton.textContent = "Salvar Alterações";
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteItem(item) {
  if (!canWrite()) { openModal('loginModal'); return; }
  if (!confirm(`Excluir "${item.name}"?`)) return;
  try {
    const { error: delErr } = await supabase.from('items').delete().eq('id', item.id);
    if (delErr) throw delErr;
    if (item.photo_key) await removeByKey(item.photo_key);
  } catch (err) {
    console.error("Erro ao deletar:", err);
    alert(`Não foi possível deletar: ${err.message || err}`);
  } finally {
    loadItems(currentSearch);
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

/* ================================
   ADMIN (profiles) + Realtime
=================================== */
async function loadProfiles() {
  if (!profilesBody) return;
  profilesBody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('email, role, active, created_at')
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

      tr.querySelector('.toggle')?.addEventListener('click', async () => {
        try {
          if (!isAdmin()) return alert('Acesso negado.');
          await supabase.from('profiles').update({ active: !p.active }).eq('email', p.email);
        } catch (e) {
          alert(e.message || e);
        } finally {
          await refreshAuth();
          await loadProfiles();
        }
      });

      tr.querySelector('.promote')?.addEventListener('click', async () => {
        try {
          if (!isAdmin()) return alert('Acesso negado.');
          await supabase.from('profiles').update({ role: 'admin', active: true }).eq('email', p.email);
        } catch (e) {
          alert(e.message || e);
        } finally {
          await refreshAuth();
          await loadProfiles();
        }
      });

      tr.querySelector('.demote')?.addEventListener('click', async () => {
        try {
          if (!isAdmin()) return alert('Acesso negado.');
          await supabase.from('profiles').update({ role: 'member', active: true }).eq('email', p.email);
        } catch (e) {
          alert(e.message || e);
        } finally {
          await refreshAuth();
          await loadProfiles();
        }
      });

      tr.querySelector('.delete')?.addEventListener('click', async () => {
        try {
          if (!isAdmin()) return alert('Acesso negado.');
          if (!confirm(`Remover ${p.email}?`)) return;
          await supabase.from('profiles').delete().eq('email', p.email);
        } catch (e) {
          alert(e.message || e);
        } finally {
          await refreshAuth();
          await loadProfiles();
        }
      });

      profilesBody.appendChild(tr);
    });
  } catch (e) {
    profilesBody.innerHTML = `<tr><td colspan="5">Erro inesperado.</td></tr>`;
  }
}

/* Realtime: items e profiles (sempre usando loaders) */
supabase
  .channel('items-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => {
    loadItems(currentSearch);
  })
  .subscribe();

const isPanelOpen = () => adminPanel && adminPanel.style.display !== 'none';
supabase
  .channel('profiles-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async () => {
    if (isPanelOpen() && isAdmin()) await loadProfiles();
    await refreshAuth(); // atualiza badge/role imediatamente
  })
  .subscribe();

/* Adicionar membro — UPSERT idempotente + refresh */
addUserBtn?.addEventListener('click', async () => {
  await refreshAuth();
  if (!isAdmin()) return alert('Apenas administradores.');
  const email = canon(newUserEmail.value);
  if (!email || !email.includes('@')) return alert('Informe um e-mail válido.');

  try {
    const { error } = await supabase
      .from('profiles')
      .upsert([{ email, role: 'member', active: true }], { onConflict: 'email', ignoreDuplicates: true });
    if (error) throw error;
  } catch (err) {
    alert('Erro ao adicionar: ' + (err.message || err));
    console.error(err);
  } finally {
    newUserEmail.value = '';
    await refreshAuth();
    await loadProfiles();
  }
});

/* ================================
   LOGIN / LOGOUT / MODAIS
=================================== */
const handleAuthClick = () => {
  if (!isLoggedIn()) {
    openModal('loginModal');
  } else {
    if (accountTitle) accountTitle.textContent = 'Conta';
    if (accountSubtitle) accountSubtitle.textContent = `${currentUser.email} • ${(currentActive ? currentRole.toUpperCase() : 'VISITOR')}`;
    openModal('accountModal');
  }
};
fabAdmin?.addEventListener('click', handleAuthClick);
userBadge?.addEventListener('click', handleAuthClick);

loginButton?.addEventListener('click', async () => {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: { prompt: 'select_account' }
    }
  });
});

logoutButton?.addEventListener('click', async () => {
  try { await supabase.auth.signOut(); }
  catch (e) { console.error('Erro no signOut:', e); }
  finally {
    editingId = null;
    itemForm?.reset();
    if (adminPanel) adminPanel.style.display = 'none';
    closeModal('accountModal');
    await refreshAuth();
    loadItems();

    // 🔑 força também o logout da sessão Google
    setTimeout(() => {
      window.location.href = "https://accounts.google.com/Logout";
    }, 500);
  }
});

closeModalBtn?.addEventListener('click', () => closeModal('loginModal'));
closeAccountModal?.addEventListener('click', () => closeModal('accountModal'));

/* Abrir painel Admin — SEM “carregando infinito” */
goAdminBtn?.addEventListener('click', async () => {
  await refreshAuth(); // garante papel atualizado
  if (!isAdmin()) return alert('Acesso negado.');

  closeModal('accountModal'); // fecha modal da conta primeiro
  if (adminPanel) {
    adminPanel.style.display = 'block'; // exibe painel imediatamente
    await loadProfiles();               // carrega dados só depois que está visível
  }

  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
});


/* ================================
   INICIALIZAÇÃO
=================================== */
document.addEventListener('DOMContentLoaded', async () => {
  btnUseCamera?.addEventListener('click', () => inputPhotoCamera?.click());
  btnUseGallery?.addEventListener('click', () => inputPhotoGallery?.click());

  await refreshAuth();
  loadItems(); // debounced

  supabase.auth.onAuthStateChange(async () => {
    await refreshAuth();
    loadItems();
  });
});
