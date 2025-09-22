import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs';

/* ================================================
   CONFIG SUPABASE (anon key para leitura pública)
   ================================================ */
const SUPABASE_URL = "https://msvmsaznklubseypxsbs.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zdm1zYXpua2x1YnNleXB4c2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyMzQ4MzQsImV4cCI6MjA3MzgxMDgzNH0.ZGDD31UVRtwUEpDBkGg6q_jgV8JD_yXqWtuZ_1dprrw";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ================================================
   ELEMENTOS
   ================================================ */
const itemForm       = document.getElementById('itemForm');
const itemList       = document.getElementById('itemList');
const submitButton   = document.getElementById('submitButton');
const searchInput    = document.getElementById('searchInput');
const exportButton   = document.getElementById('exportButton');
const visitorHint    = document.getElementById('visitorHint');
const adminPanel     = document.getElementById('adminPanel');

const inputPhotoCamera  = document.getElementById("itemPhotoCamera");
const inputPhotoGallery = document.getElementById("itemPhotoGallery");
const btnUseCamera      = document.getElementById("btnUseCamera");
const btnUseGallery     = document.getElementById("btnUseGallery");

/* FAB & Modais */
const fabAdmin           = document.getElementById('fabAdmin');
const loginModal         = document.getElementById('loginModal');
const accountModal       = document.getElementById('accountModal');
const loginButton        = document.getElementById('loginButton');
const closeModalBtn      = document.getElementById('closeModal');
const logoutButton       = document.getElementById('logoutButton');
const closeAccountModal  = document.getElementById('closeAccountModal');
const accountTitle       = document.getElementById('accountTitle');
const accountSubtitle    = document.getElementById('accountSubtitle');
const goAdminBtn         = document.getElementById('goAdminBtn');

/* Admin panel controls */
const profilesBody = document.getElementById('profilesBody');
const addUserBtn   = document.getElementById('addUserBtn');
const newUserEmail = document.getElementById('newUserEmail');

/* ================================================
   ESTADO DE AUTENTICAÇÃO / PAPÉIS
   ================================================ */
let editingId = null;
let currentUser = null;
let currentRole = 'visitor'; // 'visitor' | 'member' | 'admin'

const isLoggedIn = () => !!currentUser;
const canWrite   = () => ['member','admin'].includes(currentRole);
const isAdmin    = () => currentRole === 'admin';

/* ================================================
   UTILS
   ================================================ */
function openModal(id) { document.getElementById(id)?.classList.add('show'); }
function closeModal(id){ document.getElementById(id)?.classList.remove('show'); }

function fmtDate(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return iso || ''; }
}

function storageKeyFromPublicUrl(url) {
  try {
    const u = new URL(url);
    const cut = '/storage/v1/object/public/';
    const idx = u.pathname.indexOf(cut);
    if (idx >= 0) {
      const after = u.pathname.slice(idx + cut.length); // item-photos/filename
      return after.split('/').slice(1).join('/');       // remove bucket
    }
    const raw = url.split('/storage/v1/object/public/')[1] || '';
    return raw.split('/').slice(1).join('/');
  } catch {
    return (url || '').split('/item-photos/')[1]?.split('?')[0] || null;
  }
}

/* Compressão simples */
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
        "image/jpeg",
        quality
      );
    };
    img.onerror = reject;
  });
}

/* Arquivo escolhido */
function getSelectedFile() {
  if (inputPhotoCamera.files.length > 0) return inputPhotoCamera.files[0];
  if (inputPhotoGallery.files.length > 0) return inputPhotoGallery.files[0];
  return null;
}

/* ================================================
   AUTH
   ================================================ */
async function refreshAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  currentUser = session?.user || null;

  if (currentUser?.email) {
    // busca case-insensitive para evitar zica de caixa/letra
    const email = currentUser.email;
    const { data: prof, error } = await supabase
      .from('profiles')
      .select('email, role, created_at')
      .ilike('email', email)         // <= chave: não depende de caixa
      .maybeSingle();

    if (error) {
      console.warn('Erro ao carregar perfil:', error.message);
      currentRole = 'visitor';
    } else {
      currentRole = prof?.role || 'visitor';
    }
  } else {
    currentRole = 'visitor';
  }

  updateAuthUI();
}

function updateAuthUI() {
  visitorHint && (visitorHint.style.display = canWrite() ? 'none' : 'block');
  goAdminBtn && (goAdminBtn.style.display = isAdmin() ? 'block' : 'none');
}

/* ================================================
   ITENS (leitura pública; CRUD condicionado)
   ================================================ */
async function loadItems(filter = "") {
  let query = supabase.from('items').select('*').order('created_at', { ascending: false });
  if (filter) query = query.ilike('name', `%${filter}%`);

  const { data, error } = await query;

  itemList.innerHTML = '';
  if (error) {
    console.error("Erro ao carregar itens:", error);
    itemList.innerHTML = `<p>Erro ao carregar itens.</p>`;
    return;
  }
  if (!data || data.length === 0) {
    itemList.innerHTML = "<p>Nenhum item encontrado.</p>";
    return;
  }

  data.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';
    const canCrud = canWrite();

    card.innerHTML = `
      <img src="${item.photo_url || ''}" alt="${item.name}" ${item.photo_url ? '' : 'style="display:none"'} />
      <h3>${item.name}</h3>
      <p><b>Qtd:</b> ${item.quantity}</p>
      <p><b>Local:</b> ${item.location}</p>
      <div class="actions" style="${canCrud ? '' : 'display:none'}">
        <button class="edit-btn" data-id="${item.id}">✏️ Editar</button>
        <button class="delete-btn" data-id="${item.id}">🗑️ Excluir</button>
      </div>
    `;

    const img = card.querySelector('img');
    img?.addEventListener('click', () => { if (item.photo_url) window.open(item.photo_url, "_blank"); });

    if (canCrud) {
      card.querySelector('.edit-btn')?.addEventListener('click', () => editItem(item.id));
      card.querySelector('.delete-btn')?.addEventListener('click', () => deleteItem(item.id));
    }

    itemList.appendChild(card);
  });
}

itemForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!canWrite()) { openModal('loginModal'); return; }

  const name     = document.getElementById('itemName').value.trim();
  const quantity = Number(document.getElementById('itemQuantity').value) || 0;
  const location = document.getElementById('itemLocation').value.trim();
  let file       = getSelectedFile();

  submitButton.disabled = true;
  submitButton.textContent = editingId ? "Salvando..." : "Cadastrando...";

  let photo_url = null;

  try {
    if (editingId) {
      if (file) {
        file = await compressImage(file, 800, 0.7);
        const { data: itemData } = await supabase.from('items').select('photo_url').eq('id', editingId).single();
        if (itemData?.photo_url) {
          const key = storageKeyFromPublicUrl(itemData.photo_url);
          if (key) await supabase.storage.from('item-photos').remove([key]);
        }
        const fileName = `${Date.now()}-${file.name}`;
        await supabase.storage.from('item-photos').upload(fileName, file);
        photo_url = `${SUPABASE_URL}/storage/v1/object/public/item-photos/${fileName}?v=${Date.now()}`;
      } else {
        const { data: itemData } = await supabase.from('items').select('photo_url').eq('id', editingId).single();
        photo_url = itemData?.photo_url || null;
      }

      const { error: upErr } = await supabase
        .from('items')
        .update({ name, quantity, location, photo_url })
        .eq('id', editingId);
      if (upErr) throw upErr;

      editingId = null;
      submitButton.textContent = "Cadastrar";
    } else {
      const { data: existing } = await supabase.from('items').select('id').eq('name', name).maybeSingle();
      if (existing) {
        alert("⚠️ Este item já está cadastrado!");
        submitButton.disabled = false;
        submitButton.textContent = "Cadastrar";
        return;
      }

      if (file) {
        file = await compressImage(file, 800, 0.7);
        const fileName = `${Date.now()}-${file.name}`;
        await supabase.storage.from('item-photos').upload(fileName, file);
        photo_url = `${SUPABASE_URL}/storage/v1/object/public/item-photos/${fileName}?v=${Date.now()}`;
      }

      const { error: insErr } = await supabase
        .from('items')
        .insert([{ name, quantity, location, photo_url }]);
      if (insErr) throw insErr;

      submitButton.textContent = "Cadastrar";
    }

    itemForm.reset();
    inputPhotoCamera.value = "";
    inputPhotoGallery.value = "";
    await loadItems();
  } catch (err) {
    console.error('Erro no cadastro/edição:', err);
    alert('Erro ao salvar. Verifique suas permissões ou tente novamente.');
  } finally {
    submitButton.disabled = false;
  }
});

async function editItem(id) {
  if (!canWrite()) { openModal('loginModal'); return; }
  const { data, error } = await supabase.from('items').select('*').eq('id', id).single();
  if (error) { alert('Erro ao carregar item.'); return; }
  document.getElementById('itemId').value = data.id;
  document.getElementById('itemName').value = data.name;
  document.getElementById('itemQuantity').value = data.quantity;
  document.getElementById('itemLocation').value = data.location;
  editingId = id;
  submitButton.textContent = "Salvar";
}

async function deleteItem(id) {
  if (!canWrite()) { openModal('loginModal'); return; }
  if (!confirm("Tem certeza que deseja excluir este item?")) return;

  try {
    const { data: itemData } = await supabase.from('items').select('photo_url').eq('id', id).single();
    if (itemData?.photo_url) {
      const key = storageKeyFromPublicUrl(itemData.photo_url);
      if (key) await supabase.storage.from('item-photos').remove([key]);
    }
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) throw error;
    await loadItems();
  } catch (err) {
    console.error('Erro ao excluir:', err);
    alert('Erro ao excluir. Verifique suas permissões.');
  }
}

/* Busca */
searchInput.addEventListener("input", (e) => { loadItems(e.target.value.trim()); });

/* Exportar Excel */
exportButton.addEventListener("click", async () => {
  const { data, error } = await supabase.from("items").select("*").order("created_at", { ascending: false });
  if (error || !data || data.length === 0) { alert("Nenhum item para exportar."); return; }

  const rows = data.map(item => ({
    Item: item.name,
    Quantidade: item.quantity,
    Local: item.location,
    Foto: item.photo_url || "Sem foto"
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventário");
  XLSX.writeFile(wb, "inventario_kids.xlsx");
});

/* ================================================
   ADMIN (somente admin)
   ================================================ */
async function loadProfiles() {
  profilesBody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, created_at')
    .order('created_at', { ascending: false });

  if (error) { profilesBody.innerHTML = `<tr><td colspan="4">Erro: ${error.message}</td></tr>`; return; }
  if (!data || data.length === 0) { profilesBody.innerHTML = '<tr><td colspan="4">Nenhum perfil.</td></tr>'; return; }

  profilesBody.innerHTML = '';
  data.forEach(p => {
    const tr = document.createElement('tr');
    const badgeClass = p.role === 'admin' ? '' : 'member';
    tr.innerHTML = `
      <td>${p.email}</td>
      <td><span class="role-badge ${badgeClass}">${p.role}</span></td>
      <td>${fmtDate(p.created_at)}</td>
      <td class="admin-row-actions">
        <button class="btn promote" data-id="${p.id}" data-role="${p.role}">Promover a Admin</button>
        <button class="btn demote"  data-id="${p.id}" data-role="${p.role}">Tornar Membro</button>
        <button class="btn delete"  data-id="${p.id}">Remover</button>
      </td>
    `;

    tr.querySelector('.promote').addEventListener('click', async () => {
      if (!isAdmin()) return alert('Acesso negado.');
      if (p.role === 'admin') return alert('Já é admin.');
      const { error } = await supabase.from('profiles').update({ role: 'admin' }).eq('id', p.id);
      if (error) return alert('Erro: ' + error.message);
      loadProfiles();
    });

    tr.querySelector('.demote').addEventListener('click', async () => {
      if (!isAdmin()) return alert('Acesso negado.');
      if (p.role === 'member') return alert('Já é membro.');
      const { error } = await supabase.from('profiles').update({ role: 'member' }).eq('id', p.id);
      if (error) return alert('Erro: ' + error.message);
      loadProfiles();
    });

    tr.querySelector('.delete').addEventListener('click', async () => {
      if (!isAdmin()) return alert('Acesso negado.');
      if (!confirm(`Remover ${p.email}?`)) return;
      const { error } = await supabase.from('profiles').delete().eq('id', p.id);
      if (error) return alert('Erro: ' + error.message);
      loadProfiles();
    });

    profilesBody.appendChild(tr);
  });
}

addUserBtn?.addEventListener('click', async () => {
  if (!isAdmin()) { alert('Apenas administradores.'); return; }
  const email = (newUserEmail.value || '').trim().toLowerCase();
  if (!email || !email.includes('@')) { alert('Informe um e-mail válido.'); return; }

  const { data: exists } = await supabase.from('profiles').select('id').eq('email', email).maybeSingle();
  if (exists?.id) { alert('Este e-mail já está cadastrado.'); return; }

  const { error } = await supabase.from('profiles').insert([{ email, role: 'member' }]);
  if (error) { alert('Erro: ' + error.message); return; }
  newUserEmail.value = '';
  loadProfiles();
});

/* ================================================
   LOGIN / LOGOUT / CONTAS
   ================================================ */
fabAdmin.addEventListener('click', () => {
  if (!isLoggedIn()) { openModal('loginModal'); }
  else {
    accountTitle.textContent = 'Conta';
    accountSubtitle.textContent = `${currentUser.email} • ${currentRole.toUpperCase()}`;
    openModal('accountModal');
  }
});

loginButton.addEventListener('click', async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) alert('Erro no login: ' + error.message);
  else if (data?.url) window.location.href = data.url;
});

logoutButton.addEventListener('click', async () => {
  await supabase.auth.signOut();
  closeModal('accountModal');
  await refreshAuth();
  await loadItems();
});

closeModalBtn.addEventListener('click', () => closeModal('loginModal'));
closeAccountModal.addEventListener('click', () => closeModal('accountModal'));

goAdminBtn.addEventListener('click', async () => {
  if (!isAdmin()) { alert('Acesso negado.'); return; }
  adminPanel.style.display = 'block';
  closeModal('accountModal');
  await loadProfiles();
});

/* ================================================
   BOTÕES DE FOTO
   ================================================ */
btnUseCamera?.addEventListener('click', () => inputPhotoCamera.click());
btnUseGallery?.addEventListener('click', () => inputPhotoGallery.click());

/* ================================================
   INICIALIZAÇÃO
   ================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  await refreshAuth();
  await loadItems();
  supabase.auth.onAuthStateChange(async () => {
    await refreshAuth();
    await loadItems();
  });
});
