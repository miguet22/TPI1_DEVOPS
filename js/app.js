/**
 * SuperList - Shopping List Application Logic
 * Datos confirmados por API Python (FastAPI) + Redis, sin persistencia offline
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
  updateMutationControls();
  await loadItems();
  // Comprobar salud del backend periódicamente
  setInterval(checkApiHealth, 5000);
}

// --- API & State Synchronization ---
function updateApiBadge(state, text) {
  if (!apiStatusBadge) return;
  apiStatusBadge.className = `api-badge ${state}`;
  const textEl = apiStatusBadge.querySelector('.status-text');
  if (textEl) textEl.textContent = text;
}

let isSaving = false;
let isSyncing = false;
let hasLoadedItems = false;

function updateMutationControls() {
  const disabled = !isOnlineWithBackend || isSaving || isSyncing;
  [openModalBtn, emptyAddBtn, clearCompletedBtn, addProductForm.querySelector('[type="submit"]')]
    .forEach(button => { if (button) button.disabled = disabled; });
  shoppingListEl.querySelectorAll('.delete-btn').forEach(button => { button.disabled = disabled; });
  shoppingListEl.querySelectorAll('.item-left').forEach(control => {
    control.setAttribute('aria-disabled', String(disabled));
    control.tabIndex = disabled ? -1 : 0;
  });
}

function setConnectionState(online) {
  isOnlineWithBackend = online;
  updateApiBadge(online ? 'online' : 'offline', online ? 'Redis Conectado' : 'API no disponible');
  const notice = document.getElementById('connection-notice');
  notice.classList.toggle('hidden', online);
  notice.textContent = hasLoadedItems
    ? 'API no disponible. La lista puede estar desactualizada. Las modificaciones estan deshabilitadas; reintentando conexion...'
    : 'API no disponible. No se pudo cargar la lista. Reintentando conexion...';
  updateMutationControls();
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options, cache: 'no-store', signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) {
    const error = new Error(`La API rechazo la solicitud (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function checkApiHealth() {
  if (isSaving || isSyncing) return;
  isSyncing = true;
  updateMutationControls();
  try {
    const health = await apiRequest('/health');
    if (!health.redis_connected) throw new Error('Redis no disponible');
    if (!isOnlineWithBackend) await loadItems();
  } catch {
    setConnectionState(false);
  } finally {
    isSyncing = false;
    updateMutationControls();
  }
}

async function loadItems() {
  try {
    const loaded = await apiRequest('/items');
    if (!Array.isArray(loaded)) throw new Error('Lista invalida');
    items = loaded;
    hasLoadedItems = true;
    setConnectionState(true);
    render();
  } catch {
    setConnectionState(false);
  }
}

async function mutateItems(path, options, onSuccess) {
  if (!isOnlineWithBackend || isSaving || isSyncing) return;
  isSaving = true;
  updateMutationControls();
  try {
    const result = await apiRequest(path, options);
    onSuccess(result);
  } catch (error) {
    if (!error.status || error.status >= 500) {
      setConnectionState(false);
      showToast('No se pudo confirmar el cambio. Espera la reconexion para comprobar la lista.', 'danger');
    } else {
      showToast(error.message, 'danger');
    }
  } finally {
    isSaving = false;
    render();
  }
}

// --- Modal Logic ---
function openModal() {
  if (!isOnlineWithBackend || isSaving || isSyncing) return;
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
  if (!name) {
    nameError.classList.add('visible');
    productNameInput.focus();
    return;
  }
  const payload = {
    name, category: productCategorySelect.value,
    quantity: productQtyInput.value.trim() || '1 un', note: productNoteInput.value.trim()
  };
  await mutateItems('/items', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  }, created => {
    items.unshift(created);
    closeModal();
    showToast(`"${name}" guardado en Redis`, 'success');
  });
}

async function toggleItemStatus(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  await mutateItems(`/items/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed: !item.completed })
  }, updated => {
    items = items.map(current => current.id === id ? updated : current);
    showToast(updated.completed ? `Comprado: ${updated.name}` : `Pendiente: ${updated.name}`, 'info');
  });
}

async function deleteItem(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  await mutateItems(`/items/${encodeURIComponent(id)}`, { method: 'DELETE' }, () => {
    items = items.filter(current => current.id !== id);
    showToast(`"${item.name}" eliminado`, 'success');
  });
}

async function handleClearCompleted() {
  if (!items.some(item => item.completed)) return;
  await mutateItems('/items/completed/clear', { method: 'DELETE' }, result => {
    items = items.filter(item => !result.removed_ids.includes(item.id));
    showToast(`Se eliminaron ${result.removed_ids.length} producto(s) comprados`, 'success');
  });
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
  updateMutationControls();

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
  updateMutationControls();
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
