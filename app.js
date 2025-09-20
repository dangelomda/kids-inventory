import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs';

const SUPABASE_URL = "https://msvmsaznklubseypxsbs.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zdm1zYXpua2x1YnNleXB4c2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyMzQ4MzQsImV4cCI6MjA3MzgxMDgzNH0.ZGDD31UVRtwUEpDBkGg6q_jgV8JD_yXqWtuZ_1dprrw";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// === Referências já existentes ===
const itemForm = document.getElementById('itemForm');
const itemList = document.getElementById('itemList');
const submitButton = document.getElementById('submitButton');
const searchInput = document.getElementById('searchInput');
const exportButton = document.getElementById('exportButton');

// === Novos elementos (login/admin) — IDs batendo com o index.html que você colou ===
const loginModal = document.getElementById('loginModal');
const adminModal = document.getElementById('adminModal');
const loginForm = document.getElementById('loginForm');
const adminButton = document.getElementById('adminButton');
const closeLoginModal = document.getElementById('closeLoginModal');
const closeAdminModal = document.getElementById('closeAdminModal');
const inviteForm = document.getElementById('inviteForm');
const userList = document.getElementById('userList');

let currentUser = null;   // quem está logado
let editingId = null;     // id do item em edição

// ============ Sessão ============
(function restoreSession() {
  try {
    const saved = localStorage.getItem('currentUser');
    if (saved) {
      currentUser = JSON.parse(saved);
      if (currentUser?.role === 'admin') {
        adminButton.style.display = 'block';
      }
    }
  } catch (e) {
    console.warn('Não foi possível restaurar sessão:', e);
  }
})();

// Util — abrir/fechar modal
function openModal(modalEl) {
  if (!modalEl) return;
  modalEl.style.display = 'block';
}
function closeModal(modalEl) {
  if (!modalEl) return;
  modalEl.style.display = 'none';
}

// Fecha modais ao clicar no X
if (closeLoginModal) closeLoginModal.onclick = () => closeModal(loginModal);
if (closeAdminModal) closeAdminModal.onclick = () => closeModal(adminModal);

// Fecha modais clicando no fundo escuro
window.addEventListener('click', (ev) => {
  if (ev.target === loginModal) closeModal(loginModal);
  if (ev.target === adminModal) closeModal(adminModal);
});

// ============ Login ============
loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = (document.getElementById('loginEmail')?.value || '').trim();
  const password = (document.getElementById('loginPassword')?.value || '').trim();
  const rememberMe = document.getElementById('rememberMe')?.checked;

  if (!email || !password) {
    alert('Preencha e-mail e senha.');
    return;
  }

  const { data, error } = await supabase
    .from('users')
    .select('id, email, role, active, password')
    .eq('email', email)
    .eq('password', password) // ⚠️ simples (plaintext). Para produção, usar hash.
    .maybeSingle();

  if (error || !data) {
    alert('❌ Login inválido.');
    return;
  }
  if (!data.active) {
    alert('⚠️ Usuário desabilitado. Fale com o administrador.');
    return;
  }

  currentUser = { id: data.id, email: data.email, role: data.role, active: data.active };
  if (rememberMe) {
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
  }
  if (currentUser.role === 'admin') {
    adminButton.style.display = 'block';
  }

  alert('✅ Login realizado!');
  closeModal(loginModal);
});

// ============ Admin ============
adminButton?.addEventListener('click', () => {
  if (!currentUser || currentUser.role !== 'admin') {
    alert('Acesso apenas para administradores.');
    return;
  }
  openModal(adminModal);
  loadUsers();
});

// Carrega lista de usuários no painel admin
async function loadUsers() {
  if (!userList) return;
  userList.innerHTML = '<p>Carregando usuários...</p>';

  const { data, error } = await supabase
    .from('users')
    .select('id, email, role, active, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    userList.innerHTML = '<p>Erro ao carregar usuários.</p>';
    console.error(error);
    return;
  }

  if (!data || data.length === 0) {
    userList.innerHTML = '<p>Nenhum usuário.</p>';
    return;
  }

  const html = data.map(u => `
    <div class="user-row" style="display:flex;align-items:center;justify-content:space-between;border:1px solid #eee;border-radius:8px;padding:0.6rem 0.8rem;margin-top:0.5rem;">
      <div>
        <div><strong>${u.email}</strong></div>
        <div style="font-size:0.85rem;color:#666;">${u.role} • ${u.active ? 'ativo' : 'desabilitado'}</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button data-action="toggle" data-id="${u.id}" style="background:${u.active ? '#e67e22' : '#27ae60'};color:#fff;border:none;border-radius:6px;padding:0.4rem 0.8rem;cursor:pointer;">
          ${u.active ? 'Desabilitar' : 'Habilitar'}
        </button>
      </div>
    </div>
  `).join('');

  userList.innerHTML = html;

  // Delegação de eventos (desabilitar/habilitar)
  userList.querySelectorAll('button[data-action="toggle"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      const user = data.find(x => x.id === id);
      if (!user) return;

      // Opcional: impedir admin de se desabilitar sozinho
      if (user.id === currentUser.id) {
        alert('Você não pode desabilitar sua própria conta.');
        return;
      }

      const { error: updErr } = await supabase
        .from('users')
        .update({ active: !user.active })
        .eq('id', id);
      if (updErr) {
        alert('Erro ao atualizar usuário.');
        console.error(updErr);
        return;
      }
      loadUsers();
    });
  });
}

// Convidar usuário (gera senha temporária)
inviteForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser || currentUser.role !== 'admin') {
    alert('Apenas administradores podem convidar.');
    return;
  }
  const email = (document.getElementById('inviteEmail')?.value || '').trim();
  if (!email) {
    alert('Informe o e-mail.');
    return;
  }

  // Senha temporária simples (8 chars)
  const tempPass = Math.random().toString(36).slice(-8);

  const { error } = await supabase
    .from('users')
    .insert([{ email, password: tempPass, role: 'user', active: true }]);

  if (error) {
    alert('Erro ao convidar (talvez e-mail já existente).');
    console.error(error);
    return;
  }

  alert(`✅ Convite criado!\nE-mail: ${email}\nSenha temporária: ${tempPass}\n\nEnvie isso ao convidado (WhatsApp/e-mail).`);
  (document.getElementById('inviteEmail').value = '');
  loadUsers();
});

// ============ Utilidades existentes ============
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

      canvas.toBlob(
        (blob) => resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' })),
        'image/jpeg',
        quality
      );
    };
    img.onerror = reject;
  });
}

// ============ Lista / Busca ============
async function loadItems(filter = "") {
  let query = supabase.from('items').select('*').order('created_at', { ascending: false });
  if (filter) query = query.ilike('name', `%${filter}%`);

  const { data, error } = await query;
  if (error) {
    console.error("Erro ao carregar itens:", error);
    return;
  }

  itemList.innerHTML = '';
  if (!data || data.length === 0) {
    itemList.innerHTML = "<p>Nenhum item encontrado.</p>";
    return;
  }

  data.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.innerHTML = `
      <img src="${item.photo_url || 'https://via.placeholder.com/150'}" alt="${item.name}">
      <h3>${item.name}</h3>
      <p><b>Qtd:</b> ${item.quantity}</p>
      <p><b>Local:</b> ${item.location}</p>
      <div class="actions">
        <button class="edit-btn">✏️ Editar</button>
        <button class="delete-btn">🗑️ Excluir</button>
      </div>
    `;

    // Abrir foto em nova aba
    card.querySelector("img").addEventListener("click", () => {
      if (item.photo_url) window.open(item.photo_url, "_blank");
    });

    // Editar (com login gate)
    card.querySelector(".edit-btn").addEventListener("click", async () => {
      if (!currentUser) {
        openModal(loginModal);
        return;
      }
      const { data: full } = await supabase.from('items').select('*').eq('id', item.id).single();
      document.getElementById('itemId').value = full.id;
      document.getElementById('itemName').value = full.name;
      document.getElementById('itemQuantity').value = full.quantity;
      document.getElementById('itemLocation').value = full.location;
      editingId = item.id;
      submitButton.textContent = "Salvar";
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Excluir (com login gate)
    card.querySelector(".delete-btn").addEventListener("click", async () => {
      if (!currentUser) {
        openModal(loginModal);
        return;
      }
      if (!confirm("Tem certeza que deseja excluir este item?")) return;

      const { data: itemData, error: itemErr } = await supabase
        .from('items')
        .select('photo_url')
        .eq('id', item.id)
        .single();
      if (itemErr) {
        alert('Erro ao buscar item.');
        console.error(itemErr);
        return;
      }

      if (itemData?.photo_url) {
        const oldName = itemData.photo_url.split('/').pop().split('?')[0];
        const { error: storageError } = await supabase.storage.from('item-photos').remove([oldName]);
        if (storageError) {
          alert('Erro ao apagar foto. Item não removido.');
          console.error(storageError);
          return; // só apaga DB se foto apagou
        }
      }

      const { error: dbError } = await supabase.from('items').delete().eq('id', item.id);
      if (dbError) {
        alert('Erro ao apagar item no banco.');
        console.error(dbError);
        return;
      }
      loadItems();
    });

    itemList.appendChild(card);
  });
}

// ============ Submit (cadastrar / salvar) ============
itemForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('itemName').value.trim();
  const quantity = Number(document.getElementById('itemQuantity').value) || 0;
  const location = document.getElementById('itemLocation').value.trim();
  let file = document.getElementById('itemPhoto').files[0];

  // Se for SALVAR (edição), exige login
  if (editingId && !currentUser) {
    openModal(loginModal);
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = editingId ? "Salvando..." : "Cadastrando...";

  try {
    let photo_url = null;

    if (editingId) {
      // UPDATE
      if (file) {
        file = await compressImage(file, 800, 0.7);

        const { data: itemData } = await supabase.from('items').select('photo_url').eq('id', editingId).single();
        if (itemData?.photo_url) {
          const oldName = itemData.photo_url.split('/').pop().split('?')[0];
          await supabase.storage.from('item-photos').remove([oldName]);
        }

        const fileName = `${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from('item-photos').upload(fileName, file);
        if (upErr) throw upErr;
        photo_url = `${SUPABASE_URL}/storage/v1/object/public/item-photos/${fileName}?v=${Date.now()}`;
      } else {
        const { data: itemData } = await supabase.from('items').select('photo_url').eq('id', editingId).single();
        photo_url = itemData?.photo_url || null;
      }

      const { error: updErr } = await supabase
        .from('items')
        .update({ name, quantity, location, photo_url })
        .eq('id', editingId);
      if (updErr) throw updErr;

      editingId = null;
      submitButton.textContent = "Cadastrar";
      itemForm.reset();
      loadItems();
    } else {
      // INSERT (deixei livre como você pediu; se quiser travar também, é só exigir currentUser aqui)
      // Evitar duplicados por nome
      const { data: existing } = await supabase.from('items').select('id').eq('name', name).maybeSingle();
      if (existing) {
        alert("⚠️ Este item já está cadastrado!");
        return;
      }

      if (file) {
        file = await compressImage(file, 800, 0.7);
        const fileName = `${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from('item-photos').upload(fileName, file);
        if (upErr) throw upErr;
        photo_url = `${SUPABASE_URL}/storage/v1/object/public/item-photos/${fileName}?v=${Date.now()}`;
      }

      const { error: insErr } = await supabase.from('items').insert([{ name, quantity, location, photo_url }]);
      if (insErr) throw insErr;

      submitButton.textContent = "Cadastrar";
      itemForm.reset();
      loadItems();
    }
  } catch (err) {
    console.error(err);
    alert('Erro ao salvar item.');
  } finally {
    submitButton.disabled = false;
  }
});

// ============ Busca ============
searchInput?.addEventListener('input', (e) => {
  const value = e.target.value.trim();
  loadItems(value);
});

// ============ Exportar Excel ============
exportButton?.addEventListener('click', async () => {
  const { data, error } = await supabase.from("items").select("*").order("created_at", { ascending: false });
  if (error || !data || data.length === 0) {
    alert("Nenhum item para exportar.");
    return;
  }

  const rows = data.map(item => ({
    Item: item.name,
    Quantidade: item.quantity,
    Local: item.location,
    Foto: item.photo_url || "Sem foto"
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Inventário");
  XLSX.writeFile(workbook, "inventario_kids.xlsx");
});

// ============ Inicial ============
loadItems();
