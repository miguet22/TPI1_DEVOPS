/**
 * SuperList - Shopping List Application Logic
 * Integración con API Python (FastAPI) + Redis & Fallback Offline en LocalStorage
 */

// API Configuration
const API_BASE_URL = '/api';
let isOnlineWithBackend = false;

// Category Definitions
const CATEGORIES = {
  frutas: { label: 'Frutas y Verduras', emoji: '🍎' },
  lacteos: { label: 'Lácteos y Huevos', emoji: '🥛' },
  carnes: { label: 'Carnes y Pescados', emoji: '🥩' },
  panaderia: { label: 'Panadería y Cereales', emoji: '🍞' },
  despensa: { label: 'Despensa', emoji: '🥫' },
  bebidas: { label: 'Bebidas', emoji: '🧃' },
  limpieza: { label: 'Limpieza', emoji: '🧼' },
  higiene: { label: 'Cuidado Personal', emoji: '🧴' },
  snacks: { label: 'Snacks y Dulces', emoji: '🍫' },
  otros: { label: 'Otros', emoji: '📦' }
};

// App State
let items = [];
let currentFilter = 'all'; // 'all' | 'pending' | 'completed'
let currentCategory = 'all';
let searchQuery = '';

// DOM Elements
const apiStatusBadge = document.getElementById('api-status-badge');
const openModalBtn = document.getElementById('open-modal-btn');
const emptyAddBtn = document.getElementById('empty-add-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelModalBtn = document.getElementById('cancel-modal-btn');
const modalOverlay = document.getElementById('modal-overlay');
const addProductForm = document.getElementById('add-product-form');

const productNameInput = document.getElementById('product-name');
const productCategorySelect = document.getElementById('product-category');
const productQtyInput = document.getElementById('product-qty');
const productNoteInput = document.getElementById('product-note');
const nameError = document.getElementById('name-error');

const shoppingListEl = document.getElementById('shopping-list');
const emptyStateEl = document.getElementById('empty-state');
const noResultsStateEl = document.getElementById('no-results-state');
const visibleCountEl = document.getElementById('visible-count');

const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const filterTabs = document.querySelectorAll('.filter-tab');
const categoryFilterSelect = document.getElementById('category-filter');

const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const percentagePill = document.getElementById('percentage-pill');
const totalCountEl = document.getElementById('total-count');
const pendingCountEl = document.getElementById('pending-count');
const completedCountEl = document.getElementById('completed-count');

const copyListBtn = document.getElementById('copy-list-btn');
const clearCompletedBtn = document.getElementById('clear-completed-btn');
const toastContainer = document.getElementById('toast-container');
const quickTagBtns = document.querySelectorAll('.tag-btn');

// --- Initialization ---
async function initApp() {
  setupEventListeners();
  await loadItems();
  // Comprobar salud del backend periódicamente
  setInterval(checkApiHealth, 15000);
}

// --- API & State Synchronization ---
function updateApiBadge(state, text) {
  if (!apiStatusBadge) return;
  apiStatusBadge.className = `api-badge ${state}`;
  const textEl = apiStatusBadge.querySelector('.status-text');
  if (textEl) textEl.textContent = text;
}

async function checkApiHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      if (data.redis_connected) {
        if (!isOnlineWithBackend) {
          isOnlineWithBackend = true;
          updateApiBadge('online', 'Redis Conectado');
        }
      } else {
        isOnlineWithBackend = false;
        updateApiBadge('offline', 'Redis Desconectado');
      }
    } else {
      isOnlineWithBackend = false;
      updateApiBadge('offline', 'Modo Offline');
    }
  } catch (err) {
    isOnlineWithBackend = false;
    updateApiBadge('offline', 'Modo Offline');
  }
}

async function loadItems() {
  updateApiBadge('checking', 'Conectando...');
  
  try {
    const res = await fetch(`${API_BASE_URL}/items`, { signal: AbortSignal.timeout(3500) });
    if (res.ok) {
      items = await res.json();
      isOnlineWithBackend = true;
      updateApiBadge('online', 'Redis Conectado');
      saveLocalBackup();
      render();
      return;
    }
  } catch (err) {
    console.warn('Backend / Redis no alcanzable, cargando desde localStorage:', err.message);
  }

  // Fallback a localStorage
  isOnlineWithBackend = false;
  updateApiBadge('offline', 'Modo Offline');
  const saved = localStorage.getItem('superlist_items');
  if (saved) {
    try {
      items = JSON.parse(saved).filter(item => !['item-1', 'item-2', 'item-3', 'item-4'].includes(item.id));
    } catch (e) {
      items = [];
    }
  } else {
    items = [];
    saveLocalBackup();
  }
  render();
}

function saveLocalBackup() {
  localStorage.setItem('superlist_items', JSON.stringify(items));
}

// --- Modal Logic ---
function openModal() {
  modalOverlay.classList.add('active');
  modalOverlay.setAttribute('aria-hidden', 'false');
  productNameInput.focus();
  nameError.classList.remove('visible');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modalOverlay.classList.remove('active');
  modalOverlay.setAttribute('aria-hidden', 'true');
  addProductForm.reset();
  productQtyInput.value = '1 un';
  productCategorySelect.value = 'lacteos';
  nameError.classList.remove('visible');
  document.body.style.overflow = '';
}

// --- Event Listeners Setup ---
function setupEventListeners() {
  // Modal openers
  openModalBtn.addEventListener('click', openModal);
  if (emptyAddBtn) emptyAddBtn.addEventListener('click', openModal);

  // Modal closers
  closeModalBtn.addEventListener('click', closeModal);
  cancelModalBtn.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });

  // Keyboard accessibility
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
      closeModal();
    }
  });

  // Quick suggestion tags in modal
  quickTagBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      productNameInput.value = btn.dataset.name;
      productCategorySelect.value = btn.dataset.cat;
      productQtyInput.value = btn.dataset.qty || '1 un';
      productNameInput.focus();
    });
  });

  // Form Submission
  addProductForm.addEventListener('submit', handleAddProduct);

  // Search input
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    clearSearchBtn.classList.toggle('hidden', searchQuery.length === 0);
    render();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.classList.add('hidden');
    searchInput.focus();
    render();
  });

  // Filter Tabs
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      render();
    });
  });

  // Category Filter
  categoryFilterSelect.addEventListener('change', (e) => {
    currentCategory = e.target.value;
    render();
  });

  // Action Buttons
  clearCompletedBtn.addEventListener('click', handleClearCompleted);
  copyListBtn.addEventListener('click', handleCopyList);
}

// --- Product Handlers ---
async function handleAddProduct(e) {
  e.preventDefault();
  const name = productNameInput.value.trim();
  const category = productCategorySelect.value;
  const quantity = productQtyInput.value.trim() || '1 un';
  const note = productNoteInput.value.trim();

  if (!name) {
    nameError.classList.add('visible');
    productNameInput.focus();
    return;
  }

  const payload = { name, category, quantity, note };

  if (isOnlineWithBackend) {
    try {
      const res = await fetch(`${API_BASE_URL}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const createdItem = await res.json();
        items.unshift(createdItem);
        saveLocalBackup();
        closeModal();
        render();
        showToast(`"${name}" guardado en Redis`, 'success');
        return;
      }
    } catch (err) {
      console.warn('Fallo al guardar en API, guardando localmente:', err);
    }
  }

  // Fallback local
  const newItem = {
    id: 'item-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
    name,
    category,
    quantity,
    note,
    completed: false,
    createdAt: Date.now()
  };

  items.unshift(newItem);
  saveLocalBackup();
  closeModal();
  render();
  showToast(`"${name}" agregado localmente`, 'success');
}

async function toggleItemStatus(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;

  const newStatus = !item.completed;
  item.completed = newStatus;
  saveLocalBackup();
  render();

  if (isOnlineWithBackend) {
    try {
      await fetch(`${API_BASE_URL}/items/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: newStatus })
      });
    } catch (err) {
      console.warn('No se pudo sincronizar el cambio con Redis:', err);
    }
  }

  if (item.completed) {
    showToast(`Comprado: ${item.name}`, 'info');
  }
}

async function deleteItem(id) {
  const itemIndex = items.findIndex(i => i.id === id);
  if (itemIndex === -1) return;

  const itemElement = document.querySelector(`[data-id="${id}"]`);
  const itemName = items[itemIndex].name;

  if (itemElement) {
    itemElement.classList.add('removing');
    setTimeout(async () => {
      items.splice(itemIndex, 1);
      saveLocalBackup();
      render();
      showToast(`"${itemName}" eliminado`, 'danger');
    }, 240);
  } else {
    items.splice(itemIndex, 1);
    saveLocalBackup();
    render();
    showToast(`"${itemName}" eliminado`, 'danger');
  }

  if (isOnlineWithBackend) {
    try {
      await fetch(`${API_BASE_URL}/items/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('No se pudo eliminar de Redis:', err);
    }
  }
}

async function handleClearCompleted() {
  const completedCount = items.filter(i => i.completed).length;
  if (completedCount === 0) {
    showToast('No hay productos comprados para limpiar', 'info');
    return;
  }

  items = items.filter(i => !i.completed);
  saveLocalBackup();
  render();
  showToast(`Se eliminaron ${completedCount} producto(s) comprados`, 'success');

  if (isOnlineWithBackend) {
    try {
      await fetch(`${API_BASE_URL}/items/completed/clear`, { method: 'DELETE' });
    } catch (err) {
      console.warn('No se pudo limpiar en Redis:', err);
    }
  }
}

function handleCopyList() {
  if (items.length === 0) {
    showToast('Tu lista está vacía', 'info');
    return;
  }

  const pending = items.filter(i => !i.completed);
  const completed = items.filter(i => i.completed);

  let text = '🛒 *MI LISTA DE SUPERMERCADO*\n\n';

  if (pending.length > 0) {
    text += '📌 *PENDIENTES:*\n';
    pending.forEach(item => {
      const cat = CATEGORIES[item.category] || { emoji: '📦' };
      text += `• ${cat.emoji} ${item.name} (${item.quantity})${item.note ? ` - _${item.note}_` : ''}\n`;
    });
  }

  if (completed.length > 0) {
    text += '\n✅ *COMPRADOS:*\n';
    completed.forEach(item => {
      text += `• ~${item.name}~ (${item.quantity})\n`;
    });
  }

  navigator.clipboard.writeText(text).then(() => {
    showToast('¡Lista copiada al portapapeles! 📋', 'success');
  }).catch(() => {
    showToast('Error al copiar la lista', 'danger');
  });
}

// --- Render Functions ---
function getFilteredItems() {
  return items.filter(item => {
    // Status Filter
    if (currentFilter === 'pending' && item.completed) return false;
    if (currentFilter === 'completed' && !item.completed) return false;

    // Category Filter
    if (currentCategory !== 'all' && item.category !== currentCategory) return false;

    // Search Query
    if (searchQuery) {
      const matchName = item.name.toLowerCase().includes(searchQuery);
      const matchNote = item.note.toLowerCase().includes(searchQuery);
      const categoryObj = CATEGORIES[item.category];
      const matchCat = categoryObj ? categoryObj.label.toLowerCase().includes(searchQuery) : false;
      if (!matchName && !matchNote && !matchCat) return false;
    }

    return true;
  });
}

function render() {
  updateStats();

  const filtered = getFilteredItems();
  visibleCountEl.textContent = filtered.length;

  shoppingListEl.innerHTML = '';

  if (items.length === 0) {
    emptyStateEl.classList.remove('hidden');
    noResultsStateEl.classList.add('hidden');
    shoppingListEl.classList.add('hidden');
    return;
  }

  emptyStateEl.classList.add('hidden');

  if (filtered.length === 0) {
    noResultsStateEl.classList.remove('hidden');
    shoppingListEl.classList.add('hidden');
    return;
  }

  noResultsStateEl.classList.add('hidden');
  shoppingListEl.classList.remove('hidden');

  filtered.forEach(item => {
    const li = createItemElement(item);
    shoppingListEl.appendChild(li);
  });
}

function createItemElement(item) {
  const li = document.createElement('li');
  li.className = `shopping-item ${item.completed ? 'completed' : ''}`;
  li.dataset.id = item.id;

  const catData = CATEGORIES[item.category] || { label: 'Otros', emoji: '📦' };

  li.innerHTML = `
    <div class="item-left" role="button" tabindex="0" aria-label="Marcar ${item.name} como ${item.completed ? 'pendiente' : 'comprado'}">
      <div class="custom-checkbox" aria-hidden="true"></div>
      <div class="item-details">
        <div class="item-title-row">
          <span class="item-name">${escapeHTML(item.name)}</span>
          <span class="badge badge-qty">${escapeHTML(item.quantity)}</span>
          <span class="badge badge-cat" data-cat="${item.category}">
            ${catData.emoji} ${catData.label}
          </span>
        </div>
        ${item.note ? `<span class="item-note">${escapeHTML(item.note)}</span>` : ''}
      </div>
    </div>
    <div class="item-right">
      <button class="delete-btn" aria-label="Eliminar ${item.name}" title="Eliminar producto">
        🗑️
      </button>
    </div>
  `;

  // Checkbox / Item click toggle
  const itemLeft = li.querySelector('.item-left');
  itemLeft.addEventListener('click', () => toggleItemStatus(item.id));
  itemLeft.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleItemStatus(item.id);
    }
  });

  // Delete button
  const deleteBtn = li.querySelector('.delete-btn');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteItem(item.id);
  });

  return li;
}

function updateStats() {
  const total = items.length;
  const completed = items.filter(i => i.completed).length;
  const pending = total - completed;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

  totalCountEl.textContent = total;
  pendingCountEl.textContent = pending;
  completedCountEl.textContent = completed;
  progressText.textContent = `${completed} de ${total} completados`;
  percentagePill.textContent = `${percentage}%`;
  progressBar.style.width = `${percentage}%`;
}

// --- Toast Notifications ---
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'danger') icon = '🗑️';

  toast.innerHTML = `<span>${icon}</span><span>${escapeHTML(message)}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => {
      toast.remove();
    }, 250);
  }, 2600);
}

// --- Helper Utilities ---
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Start application
document.addEventListener('DOMContentLoaded', initApp);
