/* app.js — Inventário Kids (Auth + Roles + Painel Admin + Auto-logout Desktop) */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs';

/* ============================
   SUPABASE
============================ */
const SUPABASE_URL = "https://msvmsaznklubseypxsbs.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zdm1zYXpua2x1YnNleXB4c2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyMzQ4MzQsImV4cCI6MjA3MzgxMDgzNH0.ZGDD31UVRtwUEpDBkGg6q_jgV8JD_yXqWtuZ_1dprrw";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ============================
   DOM
============================ */
const itemForm = document.getElementById('itemForm');
const itemList = document.getElementById('itemList');
const submitButton = document.getElementById('submitButton');
const searchInput = document.getElementById('searchInput');
const exportButton = document.getElementById('exportButton');
const visitorHint = document.getElementById('visitorHint');

const inputPhotoCamera = document.getElementById('itemPhotoCamera');
const inputPhotoGallery = document.getElementById('itemPhotoGallery');
document.getElementById('btnUseCamera').onclick = () => inputPhotoCamera.click();
document.getElementById('btnUseGallery').onclick = () => inputPhotoGallery.click();

const adminPanel = document.getElementById('adminPanel');
const profilesBody = document.getElementById('profilesBody');
const addUserBtn = document.getElementById('addUserBtn');
const newUserEmailInput = document.getElementById('newUserEmail');

const fabAdmin = document.getElementById('fabAdmin');
const loginModal = document.getElementById('loginModal');
const accountModal = document.getElementById('accountModal');
const loginButton = document.getElementById('loginButton');
const closeLogin = document.getElementById('closeModal');
const logoutButton = document.getElementById('logoutButton');
const closeAccountModal = document.getElementById('closeAccountModal');
const goAdminBtn = document.getElementById('goAdminBtn');
const accountTitle = document.getElementById('accountTitle');
const accountSubtitle = document.getElementById('accountSubtitle');

let editingId = null;
let currentUser = null;
let isAdmin = false;

/* ============================
   UTILS
============================ */
function isDesktop() {
  const ua = navigator.userAgent || '';
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const coarsePointer = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
  return !isMobileUA && !coarsePointer;
}

let idleTimer = null;
const IDLE_LIMIT_MS = 10 * 60 * 1000; // 10 min desktop

function startIdleTimerIfDesktop() {
  stopIdleTimer();
  if (!isDesktop()) return;
  if (!currentUser) return;

  const reset = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => {
      await supabase.auth.signOut();
      currentUser = null;
      isAdmin = false;
      renderAccess();
      alert('Sessão encerrada por inatividade (desktop).');
    }, IDLE_LIMIT_MS);
  };
  ['mousemove','mousedown','keydown','scroll','click','touchstart'].forEach(evt =>
    window.addEventListener(evt, reset, { passive:true })
  );
  reset();
}
function stopIdleTimer(){ if (idleTimer) clearTimeout(idleTimer); }

function openModal(el){ el.style.display = 'flex'; }
function closeModal(el){ el.style.display = 'none'; }

/* ============================
   AUTH + ROLE
============================ */
async function getUserAndRole() {
  const { data } = await supabase.auth.getSession();
  currentUser = data?.session?.user || null;
  isAdmin = false;

  if (currentUser) {
    // garante que o profile exista; se não, cria como member
    await supabase.from('profiles')
      .insert({ id: currentUser.id, email: currentUser.email, role: 'member' })
      .then(()=>{}).catch(()=>{ /* ignora conflito */ });

    const { data: prof } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', currentUser.id)
      .maybeSingle();

    if (prof?.role === 'admin') isAdmin = true;
  }
}

async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href }
  });
  if (error) alert('Erro no login: ' + error.message);
}
async function signOutAll() {
  await supabase.auth.signOut();
  currentUser = null; isAdmin = false;
  renderAccess();
}

/* Ouve mudanças de sessão */
supabase.auth.onAuthStateChange(async () => {
  await getUserAndRole();
  renderAccess();
});

/* ============================
   UI / ACESSO
============================ */
function renderAccess() {
  // Form: só admin e member podem cadastrar/editar/excluir; visitante apenas leitura
  const canEdit = !!currentUser; // membro e admin podem (RLS ainda restringe server-side por role)
  const showAdmin = isAdmin;

  // No cliente: libera botões só se admin (para ficar coerente com seu pedido)
  // Se quiser que 'member' também edite, troque para: const canEdit = isAdmin || isMember;
  const allowCrudClient = isAdmin;

  // Dica visitante
  visitorHint.style.display = currentUser ? 'none' : 'block';

  // Habilita/desabilita elementos do form
  [...itemForm.querySelectorAll('input,button,select,textarea')].forEach(el => {
    if (el === searchInput || el === exportButton) return;
    el.disabled = !allowCrudClient;
  });
  submitButton.textContent = editingId ? 'Salvar' : 'Cadastrar';

  // Painel admin
  adminPanel.style.display = showAdmin ? 'block' : 'none';
  goAdminBtn.style.display = showAdmin ? 'block' : 'none';

  // FAB abre modal de conta/login
  fabAdmin.style.display = 'block';

  // Modal Conta: título/subtítulo
  if (currentUser) {
    accountTitle.textContent = isAdmin ? 'Admin' : 'Conta';
    accountSubtitle.textContent = currentUser.email || '';
  } else {
    accountTitle.textContent = 'Visitante';
    accountSubtitle.textContent = 'Entre para gerenciar itens.';
  }

  stopIdleTimer();
  startIdleTimerIfDesktop();

  // Recarrega itens para refletir botões (editar/excluir)
  loadItems(searchInput.value.trim());
  if (showAdmin) loadProfiles();
}

/* FAB → abre modal de conta/login */
fabAdmin.addEventListener('click', () => {
  if (currentUser) {
    openModal(accountModal);
  } else {
    openModal(loginModal);
  }
});
closeLogin.addEventListener('click', () => closeModal(loginModal));
closeAccountModal.addEventListener('click', () => closeModal(accountModal));
loginButton.addEventListener('click', signInWithGoogle);
logoutButton.addEventListener('click', async () => { await signOutAll(); closeModal(accountModal); });
goAdminBtn.addEventListener('click', () => {
  closeModal(accountModal);
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
});

/* ============================
   IMAGEM: compressão
============================ */
async function compressImage(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        blob => resolve(new File([blob], file.name.replace(/\.[^.]+$/,'') + '.jpg', { type: 'image/jpeg' })),
        'image/jpeg', quality
      );
    };
    img.onerror = reject;
  });
}
function getSelectedFile() {
  if (inputPhotoCamera?.files?.length) return inputPhotoCamera.files[0];
  if (inputPhotoGallery?.files?.length) return inputPhotoGallery.files[0];
  return null;
}

/* ============================
   LISTAR ITENS
============================ */
async function loadItems(filter = "") {
  let query = supabase.from('items').select('*').order('created_at', { ascending: false });
  if (filter) query = query.ilike('name', `%${filter}%`);

  const { data, error } = await query;
  if (error) {
    console.error('Erro ao carregar itens:', error);
    itemList.innerHTML = '<p>Erro ao carregar itens.</p>';
    return;
  }

  itemList.innerHTML = '';
  if (!data || data.length === 0) {
    itemList.innerHTML = '<p>Nenhum item encontrado.</p>';
    return;
  }

  data.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';
    const imgSrc = item.photo_url || '';
    card.innerHTML = `
      <img src="${imgSrc}" alt="${item.name || ''}">
      <h3>${item.name}</h3>
      <p><b>Qtd:</b> ${item.quantity}</p>
      <p><b>Local:</b> ${item.location}</p>
      <div class="actions"></div>
    `;

    const img = card.querySelector('img');
    img.addEventListener('click', () => { if (imgSrc) window.open(imgSrc, '_blank'); });

    const actions = card.querySelector('.actions');

    if (isAdmin) {
      const editBtn = document.createElement('button');
      editBtn.className = 'edit-btn';
      editBtn.textContent = '✏️ Editar';
      editBtn.onclick = () => editItem(item.id);

      const delBtn = document.createElement('button');
      delBtn.className = 'delete-btn';
      delBtn.textContent = '🗑️ Excluir';
      delBtn.onclick = () => deleteItem(item.id);

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
    }

    itemList.appendChild(card);
  });
}

/* ============================
   CRUD ITENS (admin)
============================ */
itemForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!isAdmin) { alert('Você não tem permissão para cadastrar/editar.'); return; }

  const name = document.getElementById('itemName').value.trim();
  const quantity = Number(document.getElementById('itemQuantity').value) || 0;
  const location = document.getElementById('itemLocation').value.trim();
  let file = getSelectedFile();

  submitButton.disabled = true;
  submitButton.textContent = editingId ? 'Salvando...' : 'Cadastrando...';

  try {
    let photo_url = null;

    if (editingId) {
      // EDITAR
      if (file) {
        file = await compressImage(file, 800, 0.7);

        const { data: itemData } = await supabase.from('items').select('photo_url').eq('id', editingId).single();
        if (itemData?.photo_url) {
          const oldName = itemData.photo_url.split('/').pop().split('?')[0];
          await supabase.storage.from('item-photos').remove([oldName]); // remove antiga
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
      submitButton.textContent = 'Cadastrar';
    } else {
      // INSERIR
      const { data: existing } = await supabase.from('items').select('id').eq('name', name).maybeSingle();
      if (existing) {
        alert('⚠️ Este item já está cadastrado!');
        submitButton.disabled = false;
        submitButton.textContent = 'Cadastrar';
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
    }

    itemForm.reset();
    inputPhotoCamera.value = '';
    inputPhotoGallery.value = '';
    await loadItems(searchInput.value.trim());
  } catch (err) {
    console.error(err);
    alert('Erro ao salvar item.');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Cadastrar';
  }
});

async function editItem(id) {
  if (!isAdmin) return alert('Sem permissão.');
  const { data, error } = await supabase.from('items').select('*').eq('id', id).single();
  if (error || !data) return alert('Item não encontrado.');

  document.getElementById('itemId').value = data.id;
  document.getElementById('itemName').value = data.name;
  document.getElementById('itemQuantity').value = data.quantity;
  document.getElementById('itemLocation').value = data.location;
  editingId = id;
  submitButton.textContent = 'Salvar';
}

async function deleteItem(id) {
  if (!isAdmin) return alert('Sem permissão.');
  if (!confirm('Tem certeza que deseja excluir este item?')) return;

  const { data: itemData } = await supabase.from('items').select('photo_url').eq('id', id).single();
  if (itemData?.photo_url) {
    const oldName = itemData.photo_url.split('/').pop().split('?')[0];
    await supabase.storage.from('item-photos').remove([oldName]); // remove do storage
  }

  const { error } = await supabase.from('items').delete().eq('id', id);
  if (error) {
    console.error(error);
    alert('Erro ao excluir item.');
    return;
  }
  loadItems(searchInput.value.trim());
}

/* ============================
   BUSCA / EXPORTAÇÃO
============================ */
searchInput.addEventListener('input', (e) => loadItems(e.target.value.trim()));

exportButton.addEventListener('click', async () => {
  const { data, error } = await supabase.from('items').select('*').order('created_at', { ascending: false });
  if (error || !data || data.length === 0) {
    alert('Nenhum item para exportar.');
    return;
  }
  const rows = data.map(item => ({
    Item: item.name,
    Quantidade: item.quantity,
    Local: item.location,
    Foto: item.photo_url || 'Sem foto'
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventário');
  XLSX.writeFile(wb, 'inventario_kids.xlsx');
});

/* ============================
   PAINEL ADMIN (profiles)
============================ */
async function loadProfiles() {
  profilesBody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,role,created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    profilesBody.innerHTML = '<tr><td colspan="4">Erro ao carregar perfis.</td></tr>';
    return;
  }
  if (!data || data.length === 0) {
    profilesBody.innerHTML = '<tr><td colspan="4">Nenhum usuário.</td></tr>';
    return;
  }

  profilesBody.innerHTML = '';
  data.forEach(u => {
    const tr = document.createElement('tr');

    const tdEmail = document.createElement('td');
    tdEmail.textContent = u.email || '(sem e-mail)';

    const tdRole = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'role-badge ' + (u.role === 'admin' ? 'admin' : 'member');
    badge.textContent = u.role === 'admin' ? 'admin' : 'member';
    tdRole.appendChild(badge);

    const tdCreated = document.createElement('td');
    tdCreated.textContent = new Date(u.created_at).toLocaleString();

    const tdActions = document.createElement('td');
    tdActions.className = 'admin-row-actions';

    if (u.role === 'admin') {
      const demote = document.createElement('button');
      demote.className = 'btn demote';
      demote.textContent = 'Tornar Membro';
      demote.onclick = () => setRole(u.id, 'member');
      tdActions.appendChild(demote);
    } else {
      const promote = document.createElement('button');
      promote.className = 'btn promote';
      promote.textContent = 'Promover a Admin';
      promote.onclick = () => setRole(u.id, 'admin');
      tdActions.appendChild(promote);
    }

    // Excluir
    const del = document.createElement('button');
    del.className = 'btn delete';
    del.textContent = 'Excluir';
    del.onclick = () => deleteProfile(u.id, u.email);
    tdActions.appendChild(del);

    tr.appendChild(tdEmail);
    tr.appendChild(tdRole);
    tr.appendChild(tdCreated);
    tr.appendChild(tdActions);
    profilesBody.appendChild(tr);
  });
}

async function setRole(userId, role) {
  if (!confirm(`Confirmar alteração de função para "${role}"?`)) return;
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) { alert('Erro ao alterar função.'); console.error(error); return; }
  loadProfiles();
}

async function deleteProfile(userId, email) {
  if (!confirm(`Excluir usuário ${email}? Isso remove o acesso.`)) return;
  const { error } = await supabase.from('profiles').delete().eq('id', userId);
  if (error) { alert('Erro ao excluir.'); console.error(error); return; }
  loadProfiles();
}

addUserBtn.addEventListener('click', async () => {
  const email = (newUserEmailInput.value || '').trim().toLowerCase();
  if (!email) return alert('Informe um e-mail.');
  // cria como member (id será gerado se sua tabela tiver default UUID; se não, apenas armazena email/role e id será vinculado no primeiro login)
  const { error } = await supabase.from('profiles').insert({ email, role: 'member' });
  if (error) { alert('Erro ao adicionar. Verifique a policy de INSERT para admin.'); console.error(error); return; }
  newUserEmailInput.value = '';
  loadProfiles();
});

/* ============================
   BOOT
============================ */
(async function bootstrap() {
  await getUserAndRole();
  renderAccess();
  await loadItems();

  // Fecha modais clicando fora
  [loginModal, accountModal].forEach(modal => {
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
  });
})();
