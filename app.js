import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs';

/* ================== CONFIG SUPABASE ================== */
const SUPABASE_URL = "https://msvmsaznklubseypxsbs.supabase.co";   // use o seu
const SUPABASE_KEY = "SEU_ANON_KEY_AQUI";                          // ANON key (não use service role no front!)

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

// Deriva o endpoint da Edge Function a partir do project-ref do URL
const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
const ADMIN_INVITE_URL = `https://${projectRef}.functions.supabase.co/admin-invite`;

/* ================== ELEMENTOS DA UI ================== */
const itemForm = document.getElementById('itemForm');
const itemList = document.getElementById('itemList');
const submitButton = document.getElementById('submitButton');
const searchInput = document.getElementById('searchInput');
const exportButton = document.getElementById('exportButton');

const loginModal = document.getElementById('loginModal');
const adminModal = document.getElementById('adminModal');
const loginForm = document.getElementById('loginForm');
const adminButton = document.getElementById('adminButton');
const closeLoginModal = document.getElementById('closeLoginModal');
const closeAdminModal = document.getElementById('closeAdminModal');
const inviteForm = document.getElementById('inviteForm');
const userList = document.getElementById('userList');

// Dois inputs de foto (câmera e galeria)
const inputPhotoCamera = document.getElementById('itemPhotoCamera');
const inputPhotoGallery = document.getElementById('itemPhotoGallery');

/* ================== HELPERS DE UI ================== */
function openModal(el){ if (el) el.style.display = 'block'; }
function closeModal(el){ if (el) el.style.display = 'none'; }

closeLoginModal && (closeLoginModal.onclick = () => closeModal(loginModal));
closeAdminModal && (closeAdminModal.onclick = () => closeModal(adminModal));

window.addEventListener('click', (ev) => {
  if (ev.target === loginModal) closeModal(loginModal);
  if (ev.target === adminModal) closeModal(adminModal);
});

async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

async function isAdminActive() {
  const session = await getSession();
  if (!session) return false;
  const { data, error } = await supabase
    .from('profiles')
    .select('role, active')
    .eq('id', session.user.id)
    .single();
  if (error || !data) return false;
  return data.role === 'admin' && data.active === true;
}

function refreshAuthUI(session) {
  if (!adminButton) return;
  if (session) {
    isAdminActive().then(ok => adminButton.style.display = ok ? 'block' : 'none');
  } else {
    adminButton.style.display = 'none';
  }
}

/* ================== LOGIN / LOGOUT ================== */
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = (document.getElementById('loginEmail')?.value || '').trim();
  const password = (document.getElementById('loginPassword')?.value || '').trim();
  if (!email || !password) {
    alert('Preencha e-mail e senha.');
    return;
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error(error);
    alert('❌ Login inválido.');
    return;
  }
  alert('✅ Login realizado!');
  closeModal(loginModal);
  refreshAuthUI(data.session);
});

// (Opcional) expor logout no console
window.logout = async () => {
  await supabase.auth.signOut();
  refreshAuthUI(null);
};

/* ================== ADMIN (CONVITE / LISTA) ================== */
adminButton?.addEventListener('click', async () => {
  const session = await getSession();
  if (!session) { openModal(loginModal); return; }
  if (!(await isAdminActive())) { alert('Acesso apenas para administradores.'); return; }
  await renderUsersTable();
  openModal(adminModal);
});

inviteForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = (document.getElementById('inviteEmail')?.value || '').trim();
  if (!email) return;

  const session = await getSession();
  if (!session) { openModal(loginModal); return; }

  try {
    const res = await fetch(ADMIN_INVITE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ email })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro ao convidar');
    alert('✅ Convite enviado por e-mail!');
    (document.getElementById('inviteEmail').value = '');
    await renderUsersTable();
  } catch (err) {
    console.error(err);
    alert('Falha ao enviar convite.');
  }
});

async function renderUsersTable() {
  if (!userList) return;
  userList.innerHTML = `<p>Carregando...</p>`;

  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,role,active,created_at')
    .order('created_at', { ascending: true });

  if (error) {
    userList.innerHTML = `<p>Erro ao carregar usuários.</p>`;
    console.error(error);
    return;
  }

  userList.innerHTML = (data || []).map(u => `
    <div class="user-row" style="display:flex;align-items:center;justify-content:space-between;border:1px solid #eee;border-radius:8px;padding:0.6rem 0.8rem;margin-top:0.5rem;">
      <div>
        <div><strong>${u.email}</strong></div>
        <div style="font-size:0.85rem;color:#666;">${u.role} • ${u.active ? 'ativo' : 'desabilitado'}</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="toggle-active" data-id="${u.id}" style="background:${u.active ? '#e67e22' : '#27ae60'};color:#fff;border:none;border-radius:6px;padding:0.4rem 0.8rem;cursor:pointer;">
          ${u.active ? 'Desabilitar' : 'Habilitar'}
        </button>
      </div>
    </div>
  `).join('');

  // Toggle ativo/inativo
  userList.querySelectorAll('.toggle-active').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      const id = ev.currentTarget.getAttribute('data-id');
      // segurança: só admin ativo pode atualizar
      if (!(await isAdminActive())) { alert('Apenas administradores.'); return; }
      const { error: updErr } = await supabase.from('profiles').update({ active: supabase.rpc ? undefined : undefined }).eq('id', id);
      // Como não temos o valor anterior aqui, buscamos e alternamos:
      const { data: userRow } = await supabase.from('profiles').select('active').eq('id', id).single();
      const next = userRow ? !userRow.active : false;
      const { error: updErr2 } = await supabase.from('profiles').update({ active: next }).eq('id', id);
      if (updErr || updErr2) {
        alert('Falha ao alterar status.');
        console.error(updErr || updErr2);
        return;
      }
      await renderUsersTable();
    });
  });
}

/* ================== FOTOS: CÂMERA/GALERIA ================== */
function getSelectedFile() {
  if (inputPhotoCamera?.files?.length) return inputPhotoCamera.files[0];
  if (inputPhotoGallery?.files?.length) return inputPhotoGallery.files[0];
  return null;
}

async function compressImage(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
      }, 'image/jpeg', quality);
    };
    img.onerror = reject;
  });
}

/* ================== LISTA / BUSCA ================== */
async function loadItems(filter = '') {
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
    card.innerHTML = `
      <img src="${item.photo_url || 'https://via.placeholder.com/300x200?text=Sem+foto'}" alt="${item.name}">
      <h3>${item.name}</h3>
      <p><b>Qtd:</b> ${item.quantity}</p>
      <p><b>Local:</b> ${item.location}</p>
      <div class="actions">
        <button class="edit-btn">✏️ Editar</button>
        <button class="delete-btn">🗑️ Excluir</button>
      </div>
    `;

    // abre foto em nova aba
    card.querySelector('img')?.addEventListener('click', () => {
      if (item.photo_url) window.open(item.photo_url, '_blank');
    });

    // editar (PROTEGIDO)
    card.querySelector('.edit-btn')?.addEventListener('click', async () => {
      const session = await getSession();
      if (!session) { openModal(loginModal); return; }
      const { data: full, error: e1 } = await supabase.from('items').select('*').eq('id', item.id).single();
      if (e1 || !full) return;
      document.getElementById('itemId').value = full.id;
      document.getElementById('itemName').value = full.name;
      document.getElementById('itemQuantity').value = full.quantity;
      document.getElementById('itemLocation').value = full.location;
      submitButton.textContent = 'Salvar';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // excluir (PROTEGIDO)
    card.querySelector('.delete-btn')?.addEventListener('click', async () => {
      const session = await getSession();
      if (!session) { openModal(loginModal); return; }
      if (!confirm('Tem certeza que deseja excluir este item?')) return;

      try {
        const { data: itemData } = await supabase.from('items').select('photo_url').eq('id', item.id).single();
        if (itemData?.photo_url) {
          const key = itemData.photo_url.split('/').pop().split('?')[0];
          const { error: rmErr } = await supabase.storage.from('item-photos').remove([key]);
          if (rmErr) throw rmErr;
        }
        const { error: dbErr } = await supabase.from('items').delete().eq('id', item.id);
        if (dbErr) throw dbErr;
        loadItems(searchInput.value.trim());
      } catch (e) {
        console.error(e);
        alert('Não foi possível excluir.');
      }
    });

    itemList.appendChild(card);
  });
}

/* ================== CADASTRAR / SALVAR (PROTEGIDO) ================== */
itemForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  // 🔒 exige login para Cadastrar/Salvar
  const session = await getSession();
  if (!session) { openModal(loginModal); return; }

  const name = document.getElementById('itemName').value.trim();
  const quantity = Number(document.getElementById('itemQuantity').value) || 0;
  const location = document.getElementById('itemLocation').value.trim();
  let file = getSelectedFile();

  submitButton.disabled = true;
  submitButton.textContent = submitButton.textContent === 'Salvar' ? 'Salvando...' : 'Cadastrando...';

  try {
    let photo_url = null;

    // Se houver foto, comprime e sobe
    if (file) {
      file = await compressImage(file, 800, 0.7);
      const fileName = `${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from('item-photos').upload(fileName, file);
      if (upErr) throw upErr;
      photo_url = `${SUPABASE_URL}/storage/v1/object/public/item-photos/${fileName}?v=${Date.now()}`;
    }

    const editingId = document.getElementById('itemId').value || null;

    if (editingId) {
      // atualizar (se trocou a foto, apaga a antiga)
      if (file) {
        const { data: itemData } = await supabase.from('items').select('photo_url').eq('id', editingId).single();
        if (itemData?.photo_url) {
          const oldKey = itemData.photo_url.split('/').pop().split('?')[0];
          await supabase.storage.from('item-photos').remove([oldKey]);
        }
      } else {
        // manter foto antiga
        const { data: itemData } = await supabase.from('items').select('photo_url').eq('id', editingId).single();
        photo_url = itemData?.photo_url || null;
      }

      const { error: updErr } = await supabase
        .from('items')
        .update({ name, quantity, location, photo_url })
        .eq('id', editingId);
      if (updErr) throw updErr;
    } else {
      // evitar duplicado por nome
      const { data: existing } = await supabase.from('items').select('id').eq('name', name).maybeSingle();
      if (existing) {
        alert('⚠️ Este item já está cadastrado!');
        submitButton.disabled = false;
        submitButton.textContent = 'Cadastrar';
        return;
      }
      const { error: insErr } = await supabase.from('items').insert([{ name, quantity, location, photo_url }]);
      if (insErr) throw insErr;
    }

    // reset
    itemForm.reset();
    if (inputPhotoCamera) inputPhotoCamera.value = '';
    if (inputPhotoGallery) inputPhotoGallery.value = '';
    document.getElementById('itemId').value = '';
    submitButton.textContent = 'Cadastrar';
    loadItems(searchInput.value.trim());
  } catch (err) {
    console.error(err);
    alert('Não foi possível salvar. Verifique se você está logado e ativo.');
  } finally {
    submitButton.disabled = false;
  }
});

/* ================== BUSCA / EXPORT ================== */
searchInput?.addEventListener('input', (e) => loadItems(e.target.value.trim()));

exportButton?.addEventListener('click', async () => {
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

/* ================== REALTIME (auto refresh) ================== */
supabase
  .channel('items-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => {
    loadItems(searchInput.value.trim());
  })
  .subscribe();

/* ================== BOOT ================== */
(async () => {
  const { data } = await supabase.auth.getSession();
  refreshAuthUI(data?.session ?? null);
  loadItems();
})();
