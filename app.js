// app.js — Inventário Kids (Versão Definitiva e Consolidada)
// - CORREÇÃO FINAL 1: Imagem abre em modal para evitar travamentos no celular.
// - CORREÇÃO FINAL 2: Auth busca perfil por ID para alinhar com as Policies (RLS) do Supabase.

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
const isPanelOpen = () => adminPanel && adminPanel.style.display !== 'none';

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
    const url = URL.createObjectURL(file);
    img.src = url;
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: "image/jpeg" }));
        }, "image/jpeg", quality
      );
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
  });
}

function getSelectedFile() {
  return inputPhotoCamera?.files?.[0] || inputPhotoGallery?.files?.[0] || null;
}

/* ================================
   STORAGE helpers
=================================== */
function makeKey() {
  const rnd = crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  return `${rnd}-${Date.now()}.jpg`;
}
function publicUrlFromKey(key) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return `${data.publicUrl}?v=${Date.now()}`;
}
async function uploadPhotoAndGetRefs(file) {
  const key = makeKey();
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(key, file);
  if (upErr) throw upErr;
  return { photo_key: key, photo_url: publicUrlFromKey(key) };
}
async function removeByKey(key) {
  if (!key) return;
  await supabase.storage.from(BUCKET).remove([key]);
}

/* ================================
   AUTH
=================================== */
async function refreshAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user || null;
  currentRole = 'visitor';
  currentActive = false;

  // CORREÇÃO DEFINITIVA 2: Buscar perfil pelo ID do usuário, não pelo email.
  // Isso garante que as Policies (RLS) do Supabase funcionem corretamente.
  if (currentUser) {
    const { data: prof, error } = await supabase
      .from('profiles')
      .select('role, active')
      .eq('id', currentUser.id) // Usar o ID do usuário autenticado
      .maybeSingle();

    if (error) {
      console.error("Erro ao buscar perfil (verifique suas Policies RLS):", error.message);
    } else if (prof) {
      currentRole   = prof.role || 'visitor';
      currentActive = !!prof.active;
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
   ITENS (CRUD)
=================================== */
async function _loadItems(filter = "") {
  let q = supabase.from('items').select('*').order('created_at', { ascending: false });
  if (filter) q = q.ilike('name', `%${filter}%`);
  const { data, error } = await q;

  if (!itemList) return;
  itemList.innerHTML = '';
  if (error) { itemList.innerHTML = `<p>Erro: ${error.message}</p>`; return; }
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
      </div>`;
    
    // CORREÇÃO DEFINITIVA 1: Imagem abre em modal para evitar travamentos no celular.
    card.querySelector('img')?.addEventListener('click', (e) => {
      e.preventDefault();
      if (item.photo_url) {
        const viewer = document.createElement('div');
        viewer.className = 'image-viewer-modal';
        viewer.innerHTML = `
            <img src="${item.photo_url}" alt="Visualização ampliada" />
            <button class="close-btn">Fechar</button>`;
        viewer.onclick = () => viewer.remove(); // Clicar fora ou no botão fecha
        document.body.appendChild(viewer);
      }
    });

    if (canWrite()) {
      card.querySelector('.edit-btn')?.addEventListener('click', () => editItem(item));
      card.querySelector('.delete-btn')?.addEventListener('click', () => deleteItem(item));
    }
    itemList.appendChild(card);
  });
}

const loadItems = debounce(_loadItems, 300);

itemForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!canWrite()) { openModal('loginModal'); return; }
  if (isSubmitting) return;
  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.textContent = editingId ? 'Salvando...' : 'Cadastrando...';

  try {
    const payload = {
        name: document.getElementById('itemName').value.trim(),
        quantity: Number(document.getElementById('itemQuantity').value) || 0,
        location: document.getElementById('itemLocation').value.trim(),
    };
    const fileRaw = getSelectedFile();
    if (fileRaw) {
      const file = await compressImage(fileRaw);
      const { photo_key, photo_url } = await uploadPhotoAndGetRefs(file);
      payload.photo_key = photo_key;
      payload.photo_url = photo_url;
    }
    const idInput = document.getElementById('itemId');
    if (editingId) {
      await supabase.from('items').update(payload).eq('id', editingId);
      const currentPhotoKey = idInput.dataset.currentPhotoKey;
      if (fileRaw && currentPhotoKey) await removeByKey(currentPhotoKey);
    } else {
      await supabase.from('items').insert([payload]);
    }
    itemForm.reset();
    if (inputPhotoCamera) inputPhotoCamera.value = "";
    if (inputPhotoGallery) inputPhotoGallery.value = "";
  } catch (err) {
    alert(`Erro ao salvar: ${err.message}`);
  } finally {
    editingId = null;
    submitButton.disabled = false;
    submitButton.textContent = 'Cadastrar';
    isSubmitting = false;
    await _loadItems(currentSearch); // Carrega imediatamente após salvar
  }
});

function editItem(item) {
  if (!canWrite()) { openModal('loginModal'); return; }
  const idInput = document.getElementById('itemId');
  idInput.value = item.id;
  idInput.dataset.currentPhotoKey = item.photo_key || '';
  document.getElementById('itemName').value = item.name;
  document.getElementById('itemQuantity').value = item.quantity;
  document.getElementById('itemLocation').value = item.location;
  editingId = item.id;
  submitButton.textContent = "Salvar Alterações";
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteItem(item) {
  if (!canWrite()) { openModal('loginModal'); return; }
  if (!confirm(`Excluir "${item.name}"?`)) return;
  try {
    await supabase.from('items').delete().eq('id', item.id);
    if (item.photo_key) await removeByKey(item.photo_key);
  } catch (err) {
    alert(`Não foi possível deletar: ${err.message}`);
  } finally {
    await _loadItems(currentSearch); // Carrega imediatamente após deletar
  }
}

/* ================================
   ADMIN (Perfis)
=================================== */
async function loadProfiles() {
  if (!profilesBody) return;
  profilesBody.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) { profilesBody.innerHTML = `<tr><td colspan="5">Erro: ${error.message}</td></tr>`; return; }
  if (!data || data.length === 0) { profilesBody.innerHTML = '<tr><td colspan="5">Nenhum perfil encontrado.</td></tr>'; return; }

  profilesBody.innerHTML = '';
  data.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${p.email}</td><td><span class="role-badge ${p.role}">${p.role}</span></td><td>${p.active ? 'ATIVO' : 'INATIVO'}</td><td>${new Date(p.created_at).toLocaleString()}</td><td class="admin-row-actions"><button class="btn toggle">${p.active ? 'Desativar' : 'Ativar'}</button><button class="btn promote">Admin</button><button class="btn demote">Membro</button><button class="btn delete">Remover</button></td>`;
    tr.querySelector('.toggle').addEventListener('click', async () => { await supabase.from('profiles').update({ active: !p.active }).eq('email', p.email); await refreshAuth(); await loadProfiles(); });
    tr.querySelector('.promote').addEventListener('click', async () => { await supabase.from('profiles').update({ role: 'admin' }).eq('email', p.email); await refreshAuth(); await loadProfiles(); });
    tr.querySelector('.demote').addEventListener('click', async () => { await supabase.from('profiles').update({ role: 'member' }).eq('email', p.email); await refreshAuth(); await loadProfiles(); });
    tr.querySelector('.delete').addEventListener('click', async () => { if (confirm(`Remover ${p.email}?`)) { await supabase.from('profiles').delete().eq('email', p.email); await refreshAuth(); await loadProfiles(); }});
    profilesBody.appendChild(tr);
  });
}

addUserBtn?.addEventListener('click', async () => {
  if (!isAdmin()) return alert('Apenas administradores.');
  const email = canon(newUserEmail.value);
  if (!email || !email.includes('@')) return alert('Informe um e-mail válido.');
  try {
    // Adiciona o perfil com o email, mas o ID precisa ser preenchido por um trigger no Supabase
    await supabase.from('profiles').upsert([{ email, role: 'member', active: true }], { onConflict: 'email' });
  } catch (err) {
    alert('Erro ao adicionar: ' + (err.message || err));
  } finally {
    newUserEmail.value = '';
    await loadProfiles();
  }
});

/* ================================
   EVENTOS GERAIS E INICIALIZAÇÃO
=================================== */
const handleAuthClick = () => {
  if (!isLoggedIn()) openModal('loginModal');
  else {
    accountSubtitle.textContent = `${currentUser.email} • ${(currentActive ? currentRole.toUpperCase() : 'VISITANTE')}`;
    openModal('accountModal');
  }
};

fabAdmin?.addEventListener('click', handleAuthClick);
userBadge?.addEventListener('click', handleAuthClick);
loginButton?.addEventListener('click', () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }));
logoutButton?.addEventListener('click', async () => { await supabase.auth.signOut(); window.location.reload(); });
goAdminBtn?.addEventListener('click', async () => { await refreshAuth(); if(isAdmin()) { closeModal('accountModal'); adminPanel.style.display = 'block'; await loadProfiles(); } else { alert('Acesso negado.'); } });
closeModalBtn?.addEventListener('click', () => closeModal('loginModal'));
closeAccountModal?.addEventListener('click', () => closeModal('accountModal'));
btnUseCamera?.addEventListener('click', () => inputPhotoCamera?.click());
btnUseGallery?.addEventListener('click', () => inputPhotoGallery?.click());
searchInput?.addEventListener('input', (e) => loadItems(e.target.value.trim()));
exportButton?.addEventListener('click', async () => {
  const { data } = await supabase.from('items').select('*').order('name');
  if (!data?.length) return alert('Nenhum item para exportar.');
  const rows = data.map(x => ({ Item: x.name, Quantidade: x.quantity, Local: x.location, Foto: x.photo_url || 'N/A' }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventário');
  XLSX.writeFile(wb, 'inventario_kids.xlsx');
});

// REALTIME
supabase.channel('items-realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => loadItems(currentSearch)).subscribe();
supabase.channel('profiles-realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async () => { await refreshAuth(); if (isPanelOpen()) await loadProfiles(); }).subscribe();

// FUNÇÃO DE RETOMADA SEGURA
const handleAppResume = async () => {
  console.log("🔄 App retomado, revalidando tudo...");
  await refreshAuth();
  _loadItems(currentSearch);
  if (isPanelOpen() && isAdmin()) {
    loadProfiles();
  }
};

// PONTO DE ENTRADA E GATILHOS DE ROBUSTEZ
document.addEventListener('DOMContentLoaded', async () => {
  await refreshAuth();
  _loadItems();
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log(`Auth event: ${event}`);
    await refreshAuth();
    _loadItems(currentSearch);
  });
});

window.addEventListener('pageshow', handleAppResume);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    handleAppResume();
  }
});