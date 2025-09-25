// app.js — Versão Final com Reinicialização de Canais Realtime (Anti-Congelamento Definitivo)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs';

/* ================================
   CONFIGURAÇÃO
=================================== */
const SUPABASE_URL = "https://msvmsaznklubseypxsbs.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zdm1zYXpua2x1YnNleXB4c2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyMzQ4MzQsImV4cCI6MjA3MzgxMDgzNH0.ZGDD31UVRtwUEpDBkGg6q_jgV8JD_yXqWtuZ_1dprrw";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const BUCKET = 'item-photos';

/* ================================
   REFERÊNCIAS DO DOM
=================================== */
const itemForm = document.getElementById('itemForm');
const itemList = document.getElementById('itemList');
// ... (demais referências do DOM)
const submitButton = document.getElementById('submitButton');
const searchInput = document.getElementById('searchInput');
const exportButton = document.getElementById('exportButton');
const visitorHint = document.getElementById('visitorHint');
const adminPanel = document.getElementById('adminPanel');
const inputPhotoCamera = document.getElementById("itemPhotoCamera");
const inputPhotoGallery = document.getElementById("itemPhotoGallery");
const btnUseCamera = document.getElementById("btnUseCamera");
const btnUseGallery = document.getElementById("btnUseGallery");
const userBadge = document.getElementById('userBadge');
const userBadgeText = document.getElementById('userBadgeText');
const userBadgeDot = document.getElementById('userBadgeDot');
const fabAdmin = document.getElementById('fabAdmin');
const loginModal = document.getElementById('loginModal');
const accountModal = document.getElementById('accountModal');
const loginButton = document.getElementById('loginButton');
const closeModalBtn = document.getElementById('closeModal');
const logoutButton = document.getElementById('logoutButton');
const closeAccountModal = document.getElementById('closeAccountModal');
const accountTitle = document.getElementById('accountTitle');
const accountSubtitle = document.getElementById('accountSubtitle');
const goAdminBtn = document.getElementById('goAdminBtn');
const profilesBody = document.getElementById('profilesBody');

/* ================================
   ESTADO GLOBAL
=================================== */
let editingId = null;
let currentUser = null;
let currentRole = 'visitor';
let currentActive = false;
let isSubmitting = false;
let currentSearch = '';
let realtimeChannels = []; // Armazena os canais realtime ativos

const isLoggedIn = () => !!currentUser;
const canWrite = () => currentActive && ['member', 'admin'].includes(currentRole);
const isAdmin = () => currentActive && currentRole === 'admin';
const isPanelOpen = () => adminPanel && adminPanel.style.display !== 'none';

/* ================================
   FUNÇÕES AUXILIARES
=================================== */
const canon = (s) => (s || '').trim().toLowerCase();
function debounce(fn, wait = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
const openModal = (id) => document.getElementById(id)?.classList.add('show');
const closeModal = (id) => document.getElementById(id)?.classList.remove('show');

function setBadge(email, role, active) {
    if (!userBadgeText || !userBadgeDot) return;
    const r = (role || 'visitor').toLowerCase();
    const tag = active ? r.toUpperCase() : 'VISITOR';
    userBadgeText.textContent = email ? `${email} • ${tag}` : 'VISITOR';
    userBadgeDot.className = `dot ${active ? r : 'visitor'}`;
}

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
   OPERAÇÕES DE STORAGE (FOTOS)
=================================== */
function makeKey() {
    const rnd = crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    return `${rnd}-${Date.now()}.jpg`;
}
async function uploadPhotoAndGetRefs(file) {
    const key = makeKey();
    const { error } = await supabase.storage.from(BUCKET).upload(key, file);
    if (error) throw error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
    return { photo_key: key, photo_url: `${data.publicUrl}?v=${Date.now()}` };
}
async function removeByKey(key) {
    if (key) await supabase.storage.from(BUCKET).remove([key]);
}

/* ================================
   LÓGICA PRINCIPAL DO APP
=================================== */
async function refreshAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    currentUser = session?.user || null;
    currentRole = 'visitor';
    currentActive = false;

    if (currentUser) {
        const { data: prof, error } = await supabase.from('profiles').select('role, active').eq('id', currentUser.id).maybeSingle();
        if (error) console.error("Erro ao buscar perfil:", error.message);
        else if (prof) {
            currentRole = prof.role || 'visitor';
            currentActive = !!prof.active;
        }
    }
    updateAuthUI();
}

function updateAuthUI() {
    if (visitorHint) visitorHint.style.display = canWrite() ? 'none' : 'block';
    if (goAdminBtn) goAdminBtn.style.display = isAdmin() ? 'block' : 'none';
    setBadge(currentUser?.email, currentRole, currentActive);
}

async function _loadItems(filter = "") {
    let q = supabase.from('items').select('*').order('created_at', { ascending: false });
    if (filter) q = q.ilike('name', `%${filter}%`);
    const { data, error } = await q;

    if (!itemList) return;
    itemList.innerHTML = '';
    if (error) { itemList.innerHTML = `<p>Erro: ${error.message}</p>`; return; }
    if (!data?.length) { itemList.innerHTML = '<p>Nenhum item encontrado.</p>'; return; }

    const canUserWrite = canWrite();
    data.forEach(item => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
      <img src="${item.photo_url || ''}" alt="${item.name}" ${item.photo_url ? '' : 'style="display:none"'} />
      <h3>${item.name}</h3>
      <p><b>Qtd:</b> ${item.quantity}</p>
      <p><b>Local:</b> ${item.location}</p>
      <div class="actions" style="${canUserWrite ? '' : 'display:none'}">
        <button class="edit-btn">✏️ Editar</button>
        <button class="delete-btn">🗑️ Excluir</button>
      </div>`;

        card.querySelector('img')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (item.photo_url) {
                const viewer = document.createElement('div');
                viewer.className = 'image-viewer-modal';
                viewer.innerHTML = `<img src="${item.photo_url}" alt="Visualização ampliada" /><button class="close-btn">Fechar</button>`;
                viewer.onclick = () => viewer.remove();
                document.body.appendChild(viewer);
            }
        });

        if (canUserWrite) {
            card.querySelector('.edit-btn')?.addEventListener('click', () => editItem(item));
            card.querySelector('.delete-btn')?.addEventListener('click', () => deleteItem(item));
        }
        itemList.appendChild(card);
    });
}

const loadItems = debounce(_loadItems, 300);

itemForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await refreshAuth();
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
    } catch (err) {
        alert(`Erro ao salvar: ${err.message}`);
    } finally {
        editingId = null;
        submitButton.disabled = false;
        submitButton.textContent = 'Cadastrar';
        isSubmitting = false;
        await _loadItems(currentSearch);
    }
});

function editItem(item) {
    document.getElementById('itemId').value = item.id;
    document.getElementById('itemId').dataset.currentPhotoKey = item.photo_key || '';
    document.getElementById('itemName').value = item.name;
    document.getElementById('itemQuantity').value = item.quantity;
    document.getElementById('itemLocation').value = item.location;
    editingId = item.id;
    submitButton.textContent = "Salvar Alterações";
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteItem(item) {
    if (!confirm(`Excluir "${item.name}"?`)) return;
    await refreshAuth();
    if (!canWrite()) { openModal('loginModal'); return; }
    try {
        await supabase.from('items').delete().eq('id', item.id);
        if (item.photo_key) await removeByKey(item.photo_key);
    } catch (err) {
        alert(`Não foi possível deletar: ${err.message}`);
    } finally {
        await _loadItems(currentSearch);
    }
}

async function loadProfiles() {
    if (!profilesBody) return;
    profilesBody.innerHTML = '<tr><td colspan="4">Carregando...</td></tr>';
    const { data, error } = await supabase.from('profiles').select('id, email, role, active').order('email');
    if (error) { profilesBody.innerHTML = `<tr><td colspan="4">Erro: ${error.message}</td></tr>`; return; }
    profilesBody.innerHTML = '';
    
    data.forEach(p => {
        const tr = document.createElement('tr');
        tr.dataset.id = p.id;
        tr.dataset.email = p.email;
        tr.dataset.active = p.active;
        tr.dataset.role = p.role;

        tr.innerHTML = `
            <td>${p.email}</td>
            <td class="role-cell"><span class="role-badge ${p.role}">${p.role}</span></td>
            <td class="status-cell">${p.active ? 'ATIVO' : 'INATIVO'}</td>
            <td class="admin-row-actions">
                <button class="btn toggle" data-action="toggle">${p.active ? 'Desativar' : 'Ativar'}</button>
                <button class="btn promote" data-action="promote">Admin</button>
                <button class="btn demote" data-action="demote">Membro</button>
                <button class="btn delete" data-action="delete">Remover</button>
            </td>`;
        profilesBody.appendChild(tr);
    });
}

profilesBody?.addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    await refreshAuth();
    if (!isAdmin()) {
        alert('Acesso negado. Sua sessão pode ter expirado.');
        return;
    }

    const tr = button.closest('tr');
    const id = tr.dataset.id;
    const email = tr.dataset.email;
    const currentActive = tr.dataset.active === 'true';
    const currentRole = tr.dataset.role;
    const action = button.dataset.action;

    const statusCell = tr.querySelector('.status-cell');
    const roleCell = tr.querySelector('.role-cell');
    const toggleButton = tr.querySelector('.toggle');

    let query;
    let optimisticUpdate;
    let revertUI;

    switch (action) {
        case 'toggle':
            const newActiveState = !currentActive;
            optimisticUpdate = () => {
                statusCell.textContent = newActiveState ? 'ATIVO' : 'INATIVO';
                toggleButton.textContent = newActiveState ? 'Desativar' : 'Ativar';
                tr.dataset.active = newActiveState;
            };
            revertUI = () => {
                statusCell.textContent = currentActive ? 'ATIVO' : 'INATIVO';
                toggleButton.textContent = currentActive ? 'Desativar' : 'Ativar';
                tr.dataset.active = currentActive;
            };
            query = supabase.from('profiles').update({ active: newActiveState }).eq('id', id);
            break;
        
        case 'promote':
            if (currentRole === 'admin') return;
            optimisticUpdate = () => {
                roleCell.innerHTML = `<span class="role-badge admin">admin</span>`;
                tr.dataset.role = 'admin';
            };
            revertUI = () => {
                roleCell.innerHTML = `<span class="role-badge ${currentRole}">${currentRole}</span>`;
                tr.dataset.role = currentRole;
            };
            query = supabase.from('profiles').update({ role: 'admin' }).eq('id', id);
            break;

        case 'demote':
            if (currentRole === 'member') return;
            optimisticUpdate = () => {
                roleCell.innerHTML = `<span class="role-badge member">member</span>`;
                tr.dataset.role = 'member';
            };
            revertUI = () => {
                roleCell.innerHTML = `<span class="role-badge ${currentRole}">${currentRole}</span>`;
                tr.dataset.role = currentRole;
            };
            query = supabase.from('profiles').update({ role: 'member' }).eq('id', id);
            break;
        
        case 'delete':
            if (id === currentUser.id) {
                alert("Você não pode remover a si mesmo.");
                return;
            }
            if (confirm(`Tem certeza que deseja remover o usuário ${email}?`)) {
                tr.style.opacity = '0.5';
                query = supabase.from('profiles').delete().eq('id', id);
                optimisticUpdate = () => tr.remove();
                revertUI = () => tr.style.opacity = '1';
            }
            break;

        default: return;
    }

    if (query) {
        optimisticUpdate();
        try {
            const { error } = await query;
            if (error) throw error;
            if (action === 'delete') return;
        } catch (error) {
            alert(`A ação falhou: ${error.message}`);
            revertUI();
        }
    }
});

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
logoutButton?.addEventListener('click', async () => { window.location.reload(); });
goAdminBtn?.addEventListener('click', async () => { 
    await refreshAuth(); 
    if(isAdmin()) { 
        closeModal('accountModal'); 
        adminPanel.style.display = 'block'; 
        await loadProfiles(); 
        setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100);
    } else { 
        alert('Acesso negado.'); 
    } 
});
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

// NOVA ARQUITETURA ANTI-CONGELAMENTO
function initRealtime() {
    // Remove canais antigos para evitar duplicatas e conexões mortas
    realtimeChannels.forEach(ch => supabase.removeChannel(ch));
    realtimeChannels = [];
    console.log("▶️ Iniciando canais Realtime...");

    const itemsChannel = supabase
        .channel('items-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => loadItems(currentSearch))
        .subscribe();

    const profilesChannel = supabase
        .channel('profiles-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, async () => {
            await refreshAuth();
            if (isPanelOpen()) await loadProfiles();
        })
        .subscribe();
    
    realtimeChannels.push(itemsChannel, profilesChannel);
}

const handleAppResume = async () => {
    console.log("🔄 App retomado, revalidando sessão e canais...");
    await refreshAuth();
    if (!currentUser) {
        openModal('loginModal'); // Só abre se o login realmente foi perdido
        return;
    }
    await _loadItems(currentSearch);
    if (isPanelOpen() && isAdmin()) {
        await loadProfiles();
    }
    initRealtime(); // Garante que os canais Realtime "acordem" junto com a aba
};

document.addEventListener('DOMContentLoaded', async () => {
    await refreshAuth();
    await _loadItems();
    initRealtime(); // Inicia o Realtime no primeiro carregamento
    
    supabase.auth.onAuthStateChange(async (event, session) => {
        await refreshAuth();
        await _loadItems(currentSearch);
    });

    window.addEventListener('pageshow', handleAppResume);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            handleAppResume();
        }
    });
});