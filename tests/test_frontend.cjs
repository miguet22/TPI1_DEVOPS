const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const appPath = path.resolve(__dirname, '../js/app.js');
const source = fs.readFileSync(appPath, 'utf8');
const product = { id: 'test', name: 'Pan', category: 'otros', quantity: '1 un', note: '', completed: false };

function element() {
  const nested = new Map();
  const classes = new Set();
  const listeners = new Map();
  return {
    value: '', style: {}, dataset: {}, children: [], attributes: {}, disabled: false,
    textContent: '',
    classList: {
      add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
      toggle(c, force) { if (force) classes.add(c); else classes.delete(c); }
    },
    set innerHTML(value) { this.children = []; },
    appendChild(child) { this.children.push(child); },
    setAttribute(key, value) { this.attributes[key] = value; },
    querySelector(selector) {
      if (!nested.has(selector)) nested.set(selector, element());
      return nested.get(selector);
    },
    querySelectorAll(selector) { return this.children.map(child => child.querySelector(selector)); },
    addEventListener(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, []);
      listeners.get(evt).push(fn);
    },
    trigger(evt, payload = {}) {
      (listeners.get(evt) || []).forEach(fn => fn(payload));
    },
    focus() {}, reset() {}, remove() {}
  };
}

function app() {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  let docListeners = new Map();
  const context = vm.createContext({
    document: {
      getElementById: get,
      querySelectorAll: () => [element(), element()],
      createElement: element,
      addEventListener(evt, fn) {
        if (!docListeners.has(evt)) docListeners.set(evt, []);
        docListeners.get(evt).push(fn);
      },
      trigger(evt, payload = {}) {
        (docListeners.get(evt) || []).forEach(fn => fn(payload));
      },
      body: element()
    },
    navigator: {
      clipboard: {
        writeText: async () => {}
      }
    },
    console, AbortSignal,
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); },
    setInterval() {},
    // Fail if any browser persistence is touched.
    localStorage: new Proxy({}, { get() { throw new Error('Storage must not be used'); } }),
    fetch: async () => { throw new Error('offline'); }
  });
  vm.runInContext(source, context, { filename: appPath });
  return {
    context, get,
    run: code => vm.runInContext(code, context),
    state: () => JSON.parse(vm.runInContext('JSON.stringify({items, isOnlineWithBackend})', context)),
    reply(value, status = 200) { context.fetch = async () => ({ ok: status < 400, status, json: async () => structuredClone(value) }); }
  };
}

test('initial outage disables mutations without loading browser storage', async () => {
  const a = app();
  await a.run('initApp()');
  assert.deepEqual(a.state().items, []);
  assert.equal(a.get('open-modal-btn').disabled, true);
  assert.equal(a.get('connection-notice').classList.contains('hidden'), false);
});

test('outage retains last confirmed list, blocks writes, recovery reloads server data', async () => {
  const a = app();
  a.reply([product]);
  await a.run('loadItems()');
  let requests = 0;
  a.context.fetch = async () => { requests++; throw new Error('offline'); };
  await a.run('checkApiHealth()');
  assert.equal(a.get('open-modal-btn').disabled, true);
  const row = a.get('shopping-list').children[0];
  assert.equal(row.querySelector('.delete-btn').disabled, true);
  assert.equal(row.querySelector('.item-left').attributes['aria-disabled'], 'true');
  await a.run("toggleItemStatus('test'); deleteItem('test'); handleClearCompleted();");
  assert.equal(requests, 1);
  assert.deepEqual(a.state().items, [product]);
  a.context.fetch = async url => ({ ok: true, json: async () => url.endsWith('/health') ? {redis_connected: true} : [{...product, completed: true}] });
  await a.run('checkApiHealth()');
  assert.equal(a.state().items[0].completed, true);
  assert.equal(a.get('open-modal-btn').disabled, false);
  assert.equal(a.get('connection-notice').classList.contains('hidden'), true);
});

for (const operation of ["toggleItemStatus('test')", "deleteItem('test')", 'handleClearCompleted()', 'handleAddProduct({preventDefault(){}})']) {
  test(`HTTP failure does not change confirmed data: ${operation}`, async () => {
    const a = app();
    const initial = {...product, completed: true};
    a.reply([initial]);
    await a.run('loadItems()');
    a.get('product-name').value = 'Nuevo';
    a.reply({}, 503);
    await a.run(operation);
    assert.deepEqual(a.state().items, [initial]);
    assert.equal(a.state().isOnlineWithBackend, false);
    assert.equal(a.get('open-modal-btn').disabled, true);
  });
}

test('validation error does not claim API is offline or change data', async () => {
  const a = app();
  a.reply([product]);
  await a.run('loadItems()');
  a.reply({}, 422);
  await a.run("toggleItemStatus('test')");
  assert.deepEqual(a.state().items, [product]);
  assert.equal(a.state().isOnlineWithBackend, true);
});

test('writes wait for confirmation and block duplicate clicks', async () => {
  const a = app();
  a.reply([product]);
  await a.run('loadItems()');
  let finish;
  let requests = 0;
  a.context.fetch = () => { requests++; return new Promise(resolve => { finish = resolve; }); };
  const pending = a.run("toggleItemStatus('test')");
  assert.equal(a.state().items[0].completed, false);
  assert.equal(a.get('open-modal-btn').disabled, true);
  await a.run("toggleItemStatus('test')");
  assert.equal(requests, 1);
  finish({ok: true, json: async () => ({...product, completed: true})});
  await pending;
  assert.equal(a.state().items[0].completed, true);
  assert.equal(a.get('open-modal-btn').disabled, false);
});

test('modal open and close flows', async () => {
  const a = app();
  a.reply([product]);
  await a.run('loadItems()');
  await a.run('openModal()');
  assert.equal(a.get('modal-overlay').classList.contains('active'), true);
  await a.run('closeModal()');
  assert.equal(a.get('modal-overlay').classList.contains('active'), false);
});

test('redis modal flows and stats rendering', async () => {
  const a = app();
  a.reply([product]);
  await a.run('loadItems()');
  await a.run('openRedisModal()');
  assert.equal(a.get('redis-modal-overlay').classList.contains('active'), true);
  
  // Stats with hash and string keys
  a.context.fetch = async () => ({
    ok: true,
    json: async () => ({
      redis_mode: 'Standalone',
      total_keys: 2,
      info: { used_memory_human: '1.2M' },
      keys: [
        { key: 'superlist:items', type: 'hash', field_count: 1, data: { item1: { name: 'Manzana' } } },
        { key: 'test_str', type: 'string', data: 'simple_val' }
      ]
    })
  });
  await a.run('loadRedisStats()');
  assert.equal(a.get('redis-mode-badge').textContent, 'Standalone');

  // Stats with empty keys
  a.context.fetch = async () => ({
    ok: true,
    json: async () => ({ redis_mode: 'Empty', keys: [] })
  });
  await a.run('loadRedisStats()');

  // Stats failure fallback
  a.context.fetch = async () => { throw new Error('Redis error'); };
  await a.run('loadRedisStats()');

  await a.run('closeRedisModal()');
  assert.equal(a.get('redis-modal-overlay').classList.contains('active'), false);
});

test('handleCopyList with empty, populated, and clipboard failure', async () => {
  const a = app();
  // Empty list
  await a.run('handleCopyList()');

  // Populated list
  a.reply([
    { id: '1', name: 'Leche', category: 'lacteos', quantity: '1 l', note: 'Fria', completed: false },
    { id: '2', name: 'Pan', category: 'panaderia', quantity: '2 un', note: '', completed: true }
  ]);
  await a.run('loadItems()');
  await a.run('handleCopyList()');

  // Clipboard failure
  a.context.navigator.clipboard.writeText = async () => { throw new Error('Clipboard denied'); };
  await a.run('handleCopyList()');
});

test('filters and search queries render accurately', async () => {
  const a = app();
  a.reply([
    { id: '1', name: 'Manzana', category: 'frutas', quantity: '1 kg', note: 'Roja', completed: false },
    { id: '2', name: 'Queso', category: 'lacteos', quantity: '500g', note: '', completed: true }
  ]);
  await a.run('loadItems()');

  // Status filter pending & completed
  await a.run('currentFilter = "pending"; render();');
  assert.equal(a.get('visible-count').textContent, 1);
  await a.run('currentFilter = "completed"; render();');
  assert.equal(a.get('visible-count').textContent, 1);

  // Category filter
  await a.run('currentFilter = "all"; currentCategory = "frutas"; render();');
  assert.equal(a.get('visible-count').textContent, 1);

  // Search filter
  await a.run('currentCategory = "all"; searchQuery = "roja"; render();');
  assert.equal(a.get('visible-count').textContent, 1);
  await a.run('searchQuery = "noexiste"; render();');
  assert.equal(a.get('visible-count').textContent, 0);
});

test('item element events and toast notification removal', async () => {
  const a = app();
  a.reply([product]);
  await a.run('loadItems()');
  a.reply({ ...product, completed: true });
  const itemEl = a.get('shopping-list').children[0];
  if (itemEl) {
    const itemLeft = itemEl.querySelector('.item-left');
    itemLeft.trigger('click');
    itemLeft.trigger('keydown', { key: 'Enter', preventDefault() {} });
    itemLeft.trigger('keydown', { key: ' ', preventDefault() {} });
    const delBtn = itemEl.querySelector('.delete-btn');
    delBtn.trigger('click', { stopPropagation() {} });
  }
  await a.run('showToast("Alerta", "danger"); showToast("Exito", "success");');
});
