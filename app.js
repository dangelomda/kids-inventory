
/* app_with_key.js - Inventário Kids (full, with Supabase anon key inserted)
   NOTE: This file was generated with the anon key you supplied. For production,
   use environment variables and never embed Service Role keys in front‑end code.
*/

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs';

const SUPABASE_URL = "https://msvmsaznklubseypxsbs.supabase.co";
// USER-PROVIDED KEY (inserted as requested)
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zdm1zYXpua2x1YnNleXB4c2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyMzQ4MzQsImV4cCI6MjA3MzgxMDgzNH0.ZGDD31UVRtwUEpDBkGg6q_jgV8JD_yXqWtuZ_1dprrw";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});

// ======= Elements =======
const itemForm = document.getElementById('itemForm');
const itemList = document.getElementById('itemList');
const submitButton = document.getElementById('submitButton');
const searchInput = document.getElementById('searchInput');
const exportButton = document.getElementById('exportButton');

const inputPhotoCamera = document.getElementById("itemPhotoCamera");
const inputPhotoGallery = document.getElementById("itemPhotoGallery");
const inputPhotoSingle = document.getElementById('itemPhoto');

// auth UI (new elements expected in index.html)
const loginBtn = document.getElementById('loginBtn') || null;
const logoutBtn = document.getElementById('logoutBtn') || null;
const userEmailEl = document.getElementById('userEmail') || null;
const adminBtn = document.getElementById('adminBtn') || null;

const loginModal = document.getElementById('loginModal') || null;
const loginForm = document.getElementById('loginForm') || null;
const loginEmail = document.getElementById('loginEmail') || null;
const loginPassword = document.getElementById('loginPassword') || null;
const loginClose = document.getElementById('loginClose') || null;
const loginError = document.getElementById('loginError') || null;

const adminModal = document.getElementById('adminModal') || null;
const adminClose = document.getElementById('adminClose') || null;
const inviteForm = document.getElementById('inviteForm') || null;
const inviteEmail = document.getElementById('inviteEmail') || null;
const usersTableBody = document.getElementById('usersTableBody') || null;

const ADMIN_INVITE_URL = `https://msvmsaznklubseypxsbs.functions.supabase.co/admin-invite`;

let editingId = null;

// ======= Helpers =======
function show(el){ if (el) el.classList.remove('hidden'); }
function hide(el){ if (el) el.classList.add('hidden'); }

async function getSession(){
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

async function requireAuth() {
  const session = await getSession();
  if (session) return true;
  // open modal if exists
  if (loginModal) show(loginModal);
  return false;
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

// ======= Compress image =======
async function compressImage(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scaleSize = Math.min(1, maxWidth / img.width);
      canvas.width = Math.round(img.width * scaleSize);
      canvas.height = Math.round(img.height * scaleSize);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        resolve(new File([blob], file.name.replace(/\.(png|jpg|jpeg|webp)$/i,'') + '.jpg', { type: "image/jpeg" }));
      }, "image/jpeg", quality);
    };
    img.onerror = reject;
  });
}

// select which photo input to use (supports camera + gallery and single)
function getSelectedFile() {
  if (inputPhotoCamera?.files?.length) return inputPhotoCamera.files[0];
  if (inputPhotoGallery?.files?.length) return inputPhotoGallery.files[0];
  return inputPhotoSingle?.files?.[0] ?? null;
}

// ======= Load items =======
async function loadItems(filter = "") {
  try {
    let query = supabase.from('items').select('*').order('created_at', { ascending: false });
    if (filter) query = query.ilike('name', `%${filter}%`);
    const { data, error } = await query;
    if (error) {
      console.error("Erro ao carregar itens:", error);
      itemList.innerHTML = '<p>Erro ao carregar itens.</p>';
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
        <img src="${item.photo_url || 'https://via.placeholder.com/300x200?text=Sem+foto'}" alt="${item.name}">
        <h3>${item.name}</h3>
        <p><b>Qtd:</b> ${item.quantity}</p>
        <p><b>Local:</b> ${item.location}</p>
        <div class="actions">
          <button class="edit-btn" data-id="${item.id}">✏️ Editar</button>
          <button class="delete-btn" data-id="${item.id}">🗑️ Excluir</button>
        </div>
      `;
      card.querySelector("img").addEventListener("click", () => {
        if (item.photo_url) window.open(item.photo_url, "_blank");
      });
      card.querySelector(".edit-btn").addEventListener("click", async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (!(await requireAuth())) return;
        const { data: full, error } = await supabase.from('items').select('*').eq('id', id).single();
        if (error || !full) return alert('Erro ao carregar item.');
        document.getElementById('itemId').value = full.id;
        document.getElementById('itemName').value = full.name;
        document.getElementById('itemQuantity').value = full.quantity;
        document.getElementById('itemLocation').value = full.location;
        editingId = id;
        submitButton.textContent = "Salvar";
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      card.querySelector(".delete-btn").addEventListener("click", async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        if (!(await requireAuth())) return;
        if (!confirm("Tem certeza que deseja excluir este item?")) return;
        try {
          const { data: itemData } = await supabase.from('items').select('photo_url').eq('id', id).single();
          if (itemData?.photo_url) {
            const oldName = itemData.photo_url.split('/').pop().split('?')[0];
            const { error: storageError } = await supabase.storage.from('item-photos').remove([oldName]);
            if (storageError) throw storageError;
          }
          const { error: dbError } = await supabase.from('items').delete().eq('id', id);
          if (dbError) throw dbError;
          loadItems(searchInput?.value?.trim() ?? "");
        } catch (err) {
          console.error("Erro ao excluir:", err);
          alert("Não foi possível excluir. Verifique se você está logado e ativo.");
        }
      });
      itemList.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    itemList.innerHTML = '<p>Erro ao carregar itens.</p>';
  }
}

// ======= Form submit (Cadastrar / Salvar) =======
itemForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('itemName').value.trim();
  const quantity = Number(document.getElementById('itemQuantity').value) || 0;
  const location = document.getElementById('itemLocation').value.trim();
  let file = getSelectedFile();

  // Require auth for any change (insert/update/delete)
  if (!(await requireAuth())) return;

  submitButton.disabled = true;
  submitButton.textContent = editingId ? "Salvando..." : "Cadastrando...";

  try {
    let photo_url = null;

    if (editingId) {
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
        photo_url = itemData?.photo_url ?? null;
      }

      const { error: updErr } = await supabase
        .from('items')
        .update({ name, quantity, location, photo_url })
        .eq('id', editingId);
      if (updErr) throw updErr;

      editingId = null;
      submitButton.textContent = "Cadastrar";
    } else {
      // Avoid duplicate by name
      const { data: existing } = await supabase.from('items').select('id').eq('name', name).maybeSingle();
      if (existing) {
        alert("⚠️ Este item já está cadastrado!");
        submitButton.disabled = false;
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
    }

    itemForm.reset();
    if (inputPhotoSingle) inputPhotoSingle.value = "";
    loadItems(searchInput?.value?.trim() ?? "");
  } catch (err) {
    console.error("Erro ao salvar:", err);
    alert("Não foi possível salvar. Verifique se você está logado e ativo.");
  } finally {
    submitButton.disabled = false;
  }
});

// ======= Search =======
searchInput?.addEventListener("input", (e) => {
  const value = e.target.value.trim();
  loadItems(value);
});

// ======= Export to Excel =======
exportButton?.addEventListener("click", async () => {
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

// ======= Auth UI handling =======
function refreshAuthUI(session) {
  if (!userEmailEl) return;
  if (session) {
    userEmailEl.textContent = session.user.email || "";
    if (loginBtn) loginBtn.style.display = "none";
    if (logoutBtn) logoutBtn.style.display = "inline-block";
    if (userEmailEl) userEmailEl.style.display = "inline-block";
    // show admin button if admin
    isAdminActive().then(ok => ok ? (adminBtn && (adminBtn.style.display = "inline-block")) : (adminBtn && (adminBtn.style.display = "none")));
  } else {
    userEmailEl.textContent = "";
    if (loginBtn) loginBtn.style.display = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (adminBtn) adminBtn.style.display = "none";
  }
}

loginBtn?.addEventListener('click', () => show(loginModal));
loginClose?.addEventListener('click', () => hide(loginModal));

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!loginEmail || !loginPassword) return;
  loginError && (loginError.textContent = "");
  const email = loginEmail.value.trim();
  const password = loginPassword.value;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    loginError && (loginError.textContent = "Login inválido.");
    return;
  }
  hide(loginModal);
  refreshAuthUI(data.session);
  loadItems();
});

logoutBtn?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  refreshAuthUI(null);
  loadItems();
});

adminBtn?.addEventListener('click', async () => {
  const ok = await isAdminActive();
  if (!ok) {
    alert("Acesso restrito ao admin.");
    return;
  }
  await renderUsersTable();
  show(adminModal);
});
adminClose?.addEventListener('click', () => hide(adminModal));

// Invite via Edge Function
inviteForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = inviteEmail.value.trim();
  if (!email) return;
  const session = await getSession();
  if (!session) {
    alert("Faça login para convidar.");
    return;
  }
  try {
    const res = await fetch(ADMIN_INVITE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ email })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erro convite');
    alert("Convite enviado por e-mail!");
    inviteEmail.value = "";
  } catch (e) {
    console.error(e);
    alert("Falha ao enviar convite.");
  }
});

// render users table for admin
async function renderUsersTable() {
  if (!usersTableBody) return;
  usersTableBody.innerHTML = `<tr><td colspan="4">Carregando...</td></tr>`;
  const { data: me } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,role,active')
    .order('created_at', { ascending: true });

  if (error) {
    usersTableBody.innerHTML = `<tr><td colspan="4">Erro ao carregar perfis.</td></tr>`;
    return;
  }

  usersTableBody.innerHTML = '';
  (data || []).forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.email}</td>
      <td>${u.role}</td>
      <td>${u.active ? 'Ativo' : 'Desabilitado'}</td>
      <td>
        <button class="mini" data-id="${u.id}" data-next="${u.active ? 'false' : 'true'}">
          ${u.active ? 'Desabilitar' : 'Reabilitar'}
        </button>
      </td>
    `;
    tr.querySelector('button').addEventListener('click', async (ev) => {
      const id = ev.currentTarget.getAttribute('data-id');
      const next = ev.currentTarget.getAttribute('data-next') === 'true';
      const { error: upErr } = await supabase
        .from('profiles')
        .update({ active: next })
        .eq('id', id);
      if (upErr) return alert("Falha ao alterar status.");
      await renderUsersTable();
    });
    usersTableBody.appendChild(tr);
  });
}

// realtime for items
supabase
  .channel('items-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => {
    loadItems(searchInput?.value?.trim() ?? "");
  })
  .subscribe();

// initial
(async () => {
  const session = await getSession();
  refreshAuthUI(session);
  loadItems();
})();

/* End of file */
