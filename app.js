import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs';

const SUPABASE_URL = "https://msvmsaznklubseypxsbs.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zdm1zYXpua2x1YnNleXB4c2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgyMzQ4MzQsImV4cCI6MjA3MzgxMDgzNH0.ZGDD31UVRtwUEpDBkGg6q_jgV8JD_yXqWtuZ_1dprrw";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const itemForm = document.getElementById('itemForm');
const itemList = document.getElementById('itemList');
const submitButton = document.getElementById('submitButton');
const searchInput = document.getElementById('searchInput');
const exportButton = document.getElementById('exportButton');
let editingId = null;

// 🔹 Compressão da imagem
async function compressImage(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scaleSize = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = img.height * scaleSize;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          resolve(new File([blob], file.name, { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = reject;
  });
}

// 🔹 Listar itens (com filtro opcional de busca)
async function loadItems(filter = "") {
  let query = supabase.from('items').select('*').order('created_at', { ascending: false });

  if (filter) {
    query = query.ilike('name', `%${filter}%`);
  }

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
        <button class="edit-btn" onclick="editItem('${item.id}')">✏️ Editar</button>
        <button class="delete-btn" onclick="deleteItem('${item.id}')">🗑️ Excluir</button>
      </div>
    `;
    card.querySelector("img").addEventListener("click", () => {
      if (item.photo_url) window.open(item.photo_url, "_blank");
    });
    itemList.appendChild(card);
  });
}

// 🔹 Salvar item
itemForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('itemName').value.trim();
  const quantity = Number(document.getElementById('itemQuantity').value) || 0;
  const location = document.getElementById('itemLocation').value.trim();
  let file = document.getElementById('itemPhoto').files[0];

  submitButton.disabled = true;
  submitButton.textContent = editingId ? "Salvando..." : "Cadastrando...";

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
      await supabase.storage.from('item-photos').upload(fileName, file);
      photo_url = `${SUPABASE_URL}/storage/v1/object/public/item-photos/${fileName}?v=${Date.now()}`;
    } else {
      const { data: itemData } = await supabase.from('items').select('photo_url').eq('id', editingId).single();
      photo_url = itemData.photo_url || null;
    }

    await supabase.from('items')
      .update({ name, quantity, location, photo_url })
      .eq('id', editingId);

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

    await supabase.from('items').insert([{ name, quantity, location, photo_url }]);
    submitButton.textContent = "Cadastrar";
  }

  submitButton.disabled = false;
  itemForm.reset();
  loadItems();
});

// 🔹 Editar
window.editItem = async (id) => {
  const { data } = await supabase.from('items').select('*').eq('id', id).single();
  document.getElementById('itemId').value = data.id;
  document.getElementById('itemName').value = data.name;
  document.getElementById('itemQuantity').value = data.quantity;
  document.getElementById('itemLocation').value = data.location;
  editingId = id;
  submitButton.textContent = "Salvar";
};

// 🔹 Excluir
window.deleteItem = async (id) => {
  if (!confirm("Tem certeza que deseja excluir este item?")) return;

  const { data: itemData } = await supabase.from('items').select('photo_url').eq('id', id).single();
  if (itemData?.photo_url) {
    const oldName = itemData.photo_url.split('/').pop().split('?')[0];
    await supabase.storage.from('item-photos').remove([oldName]);
  }

  await supabase.from('items').delete().eq('id', id);
  loadItems();
};

// 🔹 Buscar em tempo real
searchInput.addEventListener("input", (e) => {
  const value = e.target.value.trim();
  loadItems(value);
});

// 🔹 Exportar para Excel
exportButton.addEventListener("click", async () => {
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

// 🔹 Inicial
loadItems();
