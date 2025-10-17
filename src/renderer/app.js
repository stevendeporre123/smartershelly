const state = {
  customers: [],
  searchQuery: '',
  customerSort: { column: 'name', direction: 'asc' },
  selectedCustomerId: null,
  scans: [],
  scanSort: { column: 'startedAt', direction: 'desc' },
  scanSearchQuery: '',
  devices: [],
  deviceSort: { column: 'name', direction: 'asc' },
  deviceSearchQuery: '',
  isScanning: false,
  selectedDeviceIds: new Set(),
  devicePowerTransitions: new Set(),
  isBulkProcessing: false,
  currentWifiSsid: null,
  autoScan: {
    enabled: false,
    isRunning: false,
    intervalMs: 60000,
    lastRunAt: null,
    nextRunAt: null
  }
};

const customerSearchEl = document.getElementById('customer-search');
const customersTableBodyEl = document.getElementById('customers-table-body');
const customersEmptyStateEl = document.getElementById('customers-empty-state');
const newCustomerBtn = document.getElementById('new-customer-btn');
const customersViewEl = document.getElementById('customers-view');
const customerDetailViewEl = document.getElementById('customer-detail-view');
const customerBackBtn = document.getElementById('customer-back-btn');
const customerDetailTitleEl = document.getElementById('customer-detail-title');
const customerDetailSubtitleEl = document.getElementById('customer-detail-subtitle');
const customerInfoGridEl = document.getElementById('customer-info-grid');
const customerScansSectionEl = document.getElementById('customer-scans-section');
const customerDevicesSectionEl = document.getElementById('customer-devices-section');
const customerScanBtn = document.getElementById('customer-scan-btn');
const customerEditBtn = document.getElementById('customer-edit-btn');
const customerLastScanEl = document.getElementById('customer-last-scan');
const devicesExportBtn = document.getElementById('devices-export-btn');
const devicesSearchEl = document.getElementById('devices-search');
const scansSearchEl = document.getElementById('scans-search');
const scansExportBtn = document.getElementById('scans-export-btn');
const customersTableHeaderEl = document.querySelector('#customers-view thead');
const customerHeaderCells = customersTableHeaderEl
  ? customersTableHeaderEl.querySelectorAll('th[data-sort]')
  : [];

const modalRoot = document.getElementById('modal-root');
const modalPanel = document.getElementById('modal-panel');
const modalTitleEl = document.getElementById('modal-title');
const modalSubtitleEl = document.getElementById('modal-subtitle');
const modalBodyEl = document.getElementById('modal-body');
const modalFooterEl = document.getElementById('modal-footer');
const modalCloseBtn = document.getElementById('modal-close');
const toastRoot = document.getElementById('toast-root');
const autoScanToggleBtn = document.getElementById('auto-scan-toggle');
const autoScanStatusEl = document.getElementById('auto-scan-status');
const autoScanMetaEl = document.getElementById('auto-scan-meta');

const MODAL_SIZE_CLASSES = {
  sm: 'max-w-lg',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-5xl'
};

const MODAL_REMOVE_CLASSES = [
  'max-w-lg',
  'max-w-xl',
  'max-w-2xl',
  'max-w-3xl',
  'max-w-4xl',
  'max-w-5xl',
  'max-w-6xl'
];

const POWER_STATE_POLL_INTERVAL = 7000;

let modalOnCloseCleanup = null;
let autoScanStatusUnsubscribe = null;
let powerStatePollTimer = null;

function refreshIcons(scope = document) {
  if (window.feather && typeof window.feather.replace === 'function') {
    window.feather.replace({
      class: 'h-4 w-4 stroke-[1.8]',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    });
  }
}

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalize(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).toLowerCase();
}

function matchesFilter(value, filterValue) {
  if (!filterValue) {
    return true;
  }
  return normalize(value).includes(normalize(filterValue));
}

function getErrorMessage(error) {
  if (!error) {
    return 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Unknown error';
}
function toggleSort(sortState, nextColumn) {
  if (sortState.column === nextColumn) {
    return {
      column: sortState.column,
      direction: sortState.direction === 'asc' ? 'desc' : 'asc'
    };
  }
  return { column: nextColumn, direction: 'asc' };
}

function getSelectedDevices() {
  return state.devices.filter((device) => state.selectedDeviceIds.has(device.id));
}

function setSelectedDeviceIds(ids = []) {
  state.selectedDeviceIds = new Set(ids);
}

function pruneSelectedDeviceIds() {
  const validIds = new Set(state.devices.map((device) => device.id));
  const filtered = [...state.selectedDeviceIds].filter((id) => validIds.has(id));
  state.selectedDeviceIds = new Set(filtered);
}

function updateHeaderSortIndicators(cells, sortState) {
  cells.forEach((cell) => {
    const label = cell.dataset.label || cell.textContent.trim();
    const isActive = cell.dataset.sort === sortState.column;
    const arrow = isActive ? (sortState.direction === 'asc' ? '^' : 'v') : '';
    const isRightAligned = cell.classList.contains('text-right');
    const layoutClasses = isRightAligned ? 'flex-row-reverse justify-end' : 'justify-start';
    cell.innerHTML = `
      <span class="inline-flex w-full items-center gap-2 ${layoutClasses}">
        <span>${escapeHtml(label)}</span>
        <span class="text-[10px] font-semibold text-slate-400">${arrow}</span>
      </span>
    `;
  });
}

function formatShortTime(isoString) {
  if (!isoString) {
    return null;
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const timePart = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) {
    return timePart;
  }
  return `${date.toLocaleDateString()} ${timePart}`;
}

function updateAutoScanState(status = {}) {
  const intervalMs =
    typeof status.intervalMs === 'number' && status.intervalMs > 0
      ? status.intervalMs
      : state.autoScan.intervalMs;
  state.autoScan.enabled = Boolean(status.enabled);
  state.autoScan.isRunning = Boolean(status.isRunning);
  state.autoScan.intervalMs = intervalMs;
  state.autoScan.lastRunAt = status.lastRunAt || null;
  state.autoScan.nextRunAt = status.nextRunAt || null;
  renderAutoScanControls();
}

function renderAutoScanControls() {
  if (!autoScanToggleBtn) {
    return;
  }
  const { enabled, isRunning, lastRunAt, nextRunAt } = state.autoScan;
  autoScanToggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  autoScanToggleBtn.classList.toggle('bg-emerald-500', enabled);
  autoScanToggleBtn.classList.toggle('border-emerald-400', enabled);
  autoScanToggleBtn.classList.toggle('bg-white/10', !enabled);
  autoScanToggleBtn.classList.toggle('border-white/30', !enabled);
  const indicator = autoScanToggleBtn.querySelector('[data-indicator]');
  if (indicator) {
    indicator.style.transform = enabled ? 'translateX(1.25rem)' : 'translateX(0)';
  }
  if (autoScanStatusEl) {
    let statusText = 'Auto checks off';
    if (enabled) {
      statusText = isRunning ? 'Auto checks running' : 'Auto checks on';
    }
    autoScanStatusEl.textContent = statusText;
  }
  if (autoScanMetaEl) {
    let metaText = '';
    if (isRunning) {
      metaText = 'Scanning now...';
    } else if (enabled && nextRunAt) {
      const nextTime = formatShortTime(nextRunAt);
      if (nextTime) {
        metaText = `Next run ${nextTime}`;
      }
    } else if (lastRunAt) {
      const lastTime = formatShortTime(lastRunAt);
      if (lastTime) {
        metaText = `Last run ${lastTime}`;
      }
    }
    autoScanMetaEl.textContent = metaText;
  }
}

renderAutoScanControls();

function stopPowerStatePolling() {
  if (powerStatePollTimer) {
    clearInterval(powerStatePollTimer);
    powerStatePollTimer = null;
  }
}

function startPowerStatePolling({ immediate = true } = {}) {
  stopPowerStatePolling();
  if (!state.selectedCustomerId) {
    return;
  }
  if (
    !window.shellyManager ||
    !window.shellyManager.devices ||
    typeof window.shellyManager.devices.getPowerStates !== 'function'
  ) {
    return;
  }
  const run = () => {
    if (document.hidden) {
      return;
    }
    refreshDevicePowerStates().catch((error) => {
      console.debug('Power state refresh failed', error);
    });
  };
  if (immediate) {
    run();
  }
  powerStatePollTimer = setInterval(run, POWER_STATE_POLL_INTERVAL);
}

async function refreshDevicePowerStates(devices = state.devices) {
  if (
    !window.shellyManager ||
    !window.shellyManager.devices ||
    typeof window.shellyManager.devices.getPowerStates !== 'function'
  ) {
    return;
  }
  if (!Array.isArray(devices) || !devices.length) {
    return;
  }
  if (!state.selectedCustomerId || state.isBulkProcessing) {
    return;
  }
  const pendingIds = new Set(state.devicePowerTransitions);
  const payload = devices
    .filter(
      (device) =>
        device &&
        device.id &&
        device.lastIp &&
        !pendingIds.has(device.id) &&
        device.isOnline !== false
    )
    .map((device) => ({
      id: device.id,
      ip: device.lastIp
    }));
  if (!payload.length) {
    return;
  }
  try {
    const response = await window.shellyManager.devices.getPowerStates(payload);
    if (!Array.isArray(response)) {
      return;
    }
    let changed = false;
    response.forEach((item) => {
      if (!item || typeof item.id === 'undefined') {
        return;
      }
      const target = state.devices.find((device) => device.id === item.id);
      if (!target) {
        return;
      }
      const nextState =
        typeof item.state === 'string' && (item.state === 'on' || item.state === 'off')
          ? item.state
          : null;
      if (nextState !== target.powerState) {
        target.powerState = nextState;
        changed = true;
      }
    });
    if (changed) {
      renderDevicesTable(customerDevicesSectionEl);
    }
  } catch (error) {
    console.debug('Failed to refresh device power states', error);
  }
}

async function initAutoScanControls() {
  if (!window.shellyManager || !window.shellyManager.autoScan) {
    return;
  }

  if (typeof autoScanStatusUnsubscribe === 'function') {
    autoScanStatusUnsubscribe();
    autoScanStatusUnsubscribe = null;
  }

  if (typeof window.shellyManager.autoScan.onStatusChanged === 'function') {
    autoScanStatusUnsubscribe = window.shellyManager.autoScan.onStatusChanged((status) => {
      updateAutoScanState(status || {});
    });
  }

  try {
    const status = await window.shellyManager.autoScan.getStatus();
    updateAutoScanState(status || {});
  } catch (error) {
    console.error('Failed to load automatic scan status', error);
  }
}

function getCustomerSortValue(customer, column) {
  switch (column) {
    case 'name':
      return normalize(customer.name);
    case 'description':
      return normalize(customer.description);
    case 'contact':
      return normalize(customer.contact);
    case 'subnet':
      return normalize(customer.subnet);
    default:
      return '';
  }
}
function showToast({ title, message, variant = 'info', timeout = 4000 }) {
  if (!toastRoot) {
    return;
  }
  const variantClasses = {
    info: {
      border: 'border-slate-200',
      background: 'bg-white',
      badge: 'bg-slate-100 text-slate-600'
    },
    success: {
      border: 'border-emerald-200',
      background: 'bg-emerald-50',
      badge: 'bg-emerald-500 text-white'
    },
    danger: {
      border: 'border-rose-200',
      background: 'bg-rose-50',
      badge: 'bg-rose-500 text-white'
    },
    warning: {
      border: 'border-amber-200',
      background: 'bg-amber-50',
      badge: 'bg-amber-500 text-white'
    }
  };
  const classes = variantClasses[variant] || variantClasses.info;
  const toast = document.createElement('div');
  toast.className = [
    'pointer-events-auto w-80 rounded-xl border shadow-lg transition-all duration-200',
    classes.border,
    classes.background
  ].join(' ');
  toast.innerHTML = `
    <div class="flex items-start gap-3 px-4 py-3">
      <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${classes.badge}">
        <span data-feather="${variant === 'success' ? 'check' : variant === 'danger' ? 'alert-triangle' : 'info'}"></span>
      </div>
      <div class="flex-1">
        ${title ? `<p class="text-sm font-semibold">${escapeHtml(title)}</p>` : ''}
        ${message ? `<p class="mt-1 text-sm leading-5 text-slate-600">${escapeHtml(message)}</p>` : ''}
      </div>
      <button class="rounded-md p-1 text-slate-400 transition hover:text-slate-600" type="button">
        <span data-feather="x"></span>
      </button>
    </div>
  `;
  const closeButton = toast.querySelector('button');
  const removeToast = () => {
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => {
      toast.remove();
    }, 200);
  };
  closeButton.addEventListener('click', removeToast);
  toastRoot.appendChild(toast);
  refreshIcons(toast);
  setTimeout(removeToast, timeout);
}

function setModalSize(size = 'md') {
  MODAL_REMOVE_CLASSES.forEach((cls) => modalPanel.classList.remove(cls));
  const sizeClass = MODAL_SIZE_CLASSES[size] || MODAL_SIZE_CLASSES.md;
  modalPanel.classList.add(sizeClass);
}

function openModal({ title, subtitle = '', size = 'md', onClose } = {}) {
  if (modalOnCloseCleanup) {
    modalOnCloseCleanup();
    modalOnCloseCleanup = null;
  }
  setModalSize(size);
  modalTitleEl.textContent = title || '';
  modalSubtitleEl.textContent = subtitle || '';
  modalSubtitleEl.classList.toggle('hidden', !subtitle);
  modalBodyEl.innerHTML = '';
  modalFooterEl.innerHTML = '';
  modalRoot.classList.remove('hidden', 'opacity-0');
  modalRoot.setAttribute('aria-hidden', 'false');
  document.body.classList.add('overflow-hidden');
  refreshIcons(modalRoot);
  modalOnCloseCleanup = typeof onClose === 'function' ? onClose : null;
}

function closeModal() {
  if (modalOnCloseCleanup) {
    modalOnCloseCleanup();
    modalOnCloseCleanup = null;
  }
  modalBodyEl.innerHTML = '';
  modalFooterEl.innerHTML = '';
  modalRoot.classList.add('hidden');
  modalRoot.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('overflow-hidden');
}

modalRoot.addEventListener('click', (event) => {
  if (event.target === modalRoot || event.target?.dataset?.modalClose !== undefined) {
    closeModal();
  }
});

modalCloseBtn.addEventListener('click', () => {
  closeModal();
});
function showAlertModal({ title, message, variant = 'info', dismissLabel = 'OK' }) {
  return new Promise((resolve) => {
    openModal({ title, size: 'sm' });
    modalBodyEl.innerHTML = `
      <div class="space-y-4 px-1 py-2">
        <p class="text-sm leading-6 text-slate-600">${escapeHtml(message)}</p>
      </div>
    `;
    const dismissButton = document.createElement('button');
    dismissButton.type = 'button';
    dismissButton.className =
      'inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800';
    dismissButton.textContent = dismissLabel;
    dismissButton.addEventListener('click', () => {
      closeModal();
      resolve(true);
    });
    modalFooterEl.appendChild(dismissButton);
    refreshIcons(modalRoot);
  });
}

function showConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger'
}) {
  return new Promise((resolve) => {
    openModal({ title, size: 'sm' });
    modalBodyEl.innerHTML = `
      <div class="space-y-4 px-1 py-2">
        <p class="text-sm leading-6 text-slate-600">${escapeHtml(message)}</p>
      </div>
    `;
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className =
      'inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-100';
    cancelButton.textContent = cancelLabel;
    cancelButton.addEventListener('click', () => {
      closeModal();
      resolve(false);
    });

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className =
      variant === 'danger'
        ? 'inline-flex items-center justify-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-500'
        : 'inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800';
    confirmButton.textContent = confirmLabel;
    confirmButton.addEventListener('click', () => {
      closeModal();
      resolve(true);
    });

    modalFooterEl.appendChild(cancelButton);
    modalFooterEl.appendChild(confirmButton);
    refreshIcons(modalRoot);
  });
}

function showInputModal({
  title,
  description = '',
  fields = [],
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  size = 'md'
}) {
  return new Promise((resolve) => {
    openModal({ title, subtitle: description, size });
    const form = document.createElement('form');
    form.className = 'space-y-4 py-2';

    fields.forEach((field) => {
      const wrapper = document.createElement('label');
      wrapper.className = 'block space-y-2 text-sm';
      const span = document.createElement('span');
      span.className = 'font-medium text-slate-700';
      span.textContent = field.label;
      const input =
        field.type === 'textarea'
          ? document.createElement('textarea')
          : document.createElement('input');
      input.name = field.name;
      input.type = field.type || 'text';
      input.required = Boolean(field.required);
      input.placeholder = field.placeholder || '';
      input.value = field.value || '';
      input.className =
        'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-300';
      if (field.type === 'textarea') {
        input.rows = field.rows || 3;
      }
      wrapper.append(span, input);
      form.appendChild(wrapper);
    });

    modalBodyEl.appendChild(form);

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className =
      'inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-100';
    cancelButton.textContent = cancelLabel;
    cancelButton.addEventListener('click', () => {
      closeModal();
      resolve(null);
    });

    const submitButton = document.createElement('button');
    submitButton.type = 'submit';
    submitButton.className =
      'inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800';
    submitButton.textContent = submitLabel;

    modalFooterEl.append(cancelButton, submitButton);
    submitButton.addEventListener('click', () => {
      form.requestSubmit();
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const result = {};
      fields.forEach((field) => {
        result[field.name] = formData.get(field.name)?.toString().trim() || '';
      });
      closeModal();
      resolve(result);
    });

    refreshIcons(modalRoot);
    const firstInput = form.querySelector('input, textarea');
    if (firstInput) {
      firstInput.focus();
    }
  });
}

function getFilteredCustomers() {
  const query = normalize(state.searchQuery);
  if (!query) {
    return state.customers;
  }
  return state.customers.filter((customer) => {
    return (
      normalize(customer.name).includes(query) ||
      normalize(customer.description).includes(query) ||
      normalize(customer.contact).includes(query) ||
      normalize(customer.subnet).includes(query) ||
      normalize(customer.wifiSsid).includes(query)
    );
  });
}

function renderCustomersTable() {
  const customers = getFilteredCustomers();
  if (!customers.length) {
    customersTableBodyEl.innerHTML = '';
    customersEmptyStateEl.classList.remove('hidden');
    updateHeaderSortIndicators(customerHeaderCells, state.customerSort);
    return;
  }

  customersEmptyStateEl.classList.add('hidden');
  const sortedCustomers = [...customers].sort((a, b) => {
    const valueA = getCustomerSortValue(a, state.customerSort.column);
    const valueB = getCustomerSortValue(b, state.customerSort.column);
    if (valueA < valueB) {
      return -1;
    }
    if (valueA > valueB) {
      return 1;
    }
    return 0;
  });
  if (state.customerSort.direction === 'desc') {
    sortedCustomers.reverse();
  }

  const rows = sortedCustomers
    .map((customer) => {
      return `
        <tr class="transition hover:bg-slate-50">
          <td class="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-800">${escapeHtml(
            customer.name
          )}</td>
          <td class="max-w-[220px] px-6 py-4 text-sm text-slate-600">${escapeHtml(
            customer.description || '-'
          )}</td>
          <td class="max-w-[200px] px-6 py-4 text-sm text-slate-600">${escapeHtml(
            customer.contact || '-'
          )}</td>
          <td class="whitespace-nowrap px-6 py-4 text-sm text-slate-600">${escapeHtml(
            customer.subnet || '-'
          )}</td>
          <td class="px-6 py-4">
            <div class="flex items-center justify-end gap-2">
              <button
                class="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                type="button"
                data-action="view"
                data-id="${customer.id}"
                title="View"
              >
                <span data-feather="eye"></span>
              </button>
              <button
                class="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                type="button"
                data-action="edit"
                data-id="${customer.id}"
                title="Edit"
              >
                <span data-feather="edit-3"></span>
              </button>
              <button
                class="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white p-2 text-rose-500 shadow-sm transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-200"
                type="button"
                data-action="delete"
                data-id="${customer.id}"
                title="Delete"
              >
                <span data-feather="trash-2"></span>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  customersTableBodyEl.innerHTML = rows;
  updateHeaderSortIndicators(customerHeaderCells, state.customerSort);
  refreshIcons(customersTableBodyEl);
}
async function loadCustomers() {
  const customers = await window.shellyManager.customers.list();
  state.customers = customers;
  renderCustomersTable();
}

async function refreshCurrentWifiSsid() {
  if (!window.shellyManager?.system?.currentWifiSsid) {
    state.currentWifiSsid = null;
    return;
  }
  try {
    const ssid = await window.shellyManager.system.currentWifiSsid();
    state.currentWifiSsid = ssid || null;
  } catch (error) {
    state.currentWifiSsid = null;
  }
}

function getCustomerById(id) {
  return state.customers.find((customer) => customer.id === id) || null;
}

function isOnCustomerNetwork(customer) {
  if (!customer || !customer.wifiSsid) {
    return false;
  }
  if (!state.currentWifiSsid) {
    return false;
  }
  return customer.wifiSsid.trim().toLowerCase() === state.currentWifiSsid.trim().toLowerCase();
}

function showCustomersListView() {
  stopPowerStatePolling();
  state.devicePowerTransitions = new Set();
  customersViewEl.classList.remove('hidden');
  customerDetailViewEl.classList.add('hidden');
  if (customerLastScanEl) {
    customerLastScanEl.textContent = '';
    customerLastScanEl.classList.add('hidden');
  }
}

function showCustomerDetailView() {
  customersViewEl.classList.add('hidden');
  customerDetailViewEl.classList.remove('hidden');
}

function createWifiStatusBadge(expectedSsid, currentSsid) {
  if (!expectedSsid) {
    return '<span class="text-sm text-slate-500">No Wi-Fi configuration stored.</span>';
  }
  const trimmedExpected = expectedSsid.trim();
  const trimmedCurrent = currentSsid ? currentSsid.trim() : '';
  const isMatch =
    trimmedCurrent && trimmedCurrent.toLowerCase() === trimmedExpected.toLowerCase();
  const badgeClass = !trimmedCurrent
    ? 'bg-slate-200 text-slate-700'
    : isMatch
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-rose-100 text-rose-700';
  const label = !trimmedCurrent
    ? 'Current Wi-Fi network unknown'
    : isMatch
    ? 'Connected to customer network'
    : `Connected to ${trimmedCurrent}`;
  return `
    <div class="flex flex-col gap-2">
      <span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}">
        ${escapeHtml(trimmedExpected)}
      </span>
      <span class="text-xs text-slate-500">${escapeHtml(label)}</span>
    </div>
  `;
}

function createMaskedPassword(password) {
  if (!password) {
    return '<span class="text-sm text-slate-500">Not set</span>';
  }
  return `
    <div class="flex items-center gap-3">
      <span class="tracking-[0.35em] text-base font-semibold text-slate-800">&bull;&bull;&bull;&bull;&bull;&bull;</span>
      <button
        type="button"
        data-action="copy-password"
        data-password="${escapeHtml(password)}"
        class="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
      >
        <span data-feather="clipboard"></span>
        Copy
      </button>
    </div>
  `;
}

async function openCustomerFormModal(mode, customer = null) {
  const isEdit = mode === 'edit';
  const title = isEdit ? 'Edit customer' : 'New customer';
  const subtitle = isEdit
    ? 'Update customer details and save your changes.'
    : 'Create a new customer.';
  openModal({ title, subtitle, size: 'lg' });

  const form = document.createElement('form');
  form.className = 'grid grid-cols-1 gap-4 py-2 md:grid-cols-2';
  form.innerHTML = `
    <div class="space-y-2 text-sm">
      <label class="font-medium text-slate-700" for="customer-name">Name</label>
      <input
        id="customer-name"
        name="name"
        type="text"
        required
        value="${escapeHtml(customer?.name || '')}"
        placeholder="Customer name"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-300"
      />
    </div>
    <div class="space-y-2 text-sm">
      <label class="font-medium text-slate-700" for="customer-contact">Contact</label>
      <input
        id="customer-contact"
        name="contact"
        type="text"
        value="${escapeHtml(customer?.contact || '')}"
        placeholder="Name, email or phone"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-300"
      />
    </div>
    <div class="space-y-2 text-sm md:col-span-2">
      <label class="font-medium text-slate-700" for="customer-description">Description</label>
      <textarea
        id="customer-description"
        name="description"
        rows="2"
        placeholder="For example location or extra notes"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-300"
      >${escapeHtml(customer?.description || '')}</textarea>
    </div>
    <div class="space-y-2 text-sm">
      <label class="font-medium text-slate-700" for="customer-subnet">Default subnet</label>
      <input
        id="customer-subnet"
        name="subnet"
        type="text"
        value="${escapeHtml(customer?.subnet || '')}"
        placeholder="e.g. 192.168.1.0/24"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-300"
      />
    </div>
    <div class="space-y-2 text-sm">
      <label class="font-medium text-slate-700" for="customer-wifi-ssid">Wi-Fi SSID</label>
      <input
        id="customer-wifi-ssid"
        name="wifiSsid"
        type="text"
        value="${escapeHtml(customer?.wifiSsid || '')}"
        placeholder="Wi-Fi network name"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-300"
      />
    </div>
    <div class="space-y-2 text-sm">
      <label class="font-medium text-slate-700" for="customer-wifi-password">Wi-Fi password</label>
      <input
        id="customer-wifi-password"
        name="wifiPassword"
        type="text"
        value="${escapeHtml(customer?.wifiPassword || '')}"
        placeholder="Optional password"
        class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-300"
      />
    </div>
  `;

  modalBodyEl.appendChild(form);

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className =
    'inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-100';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', () => {
    closeModal();
  });

  const submitButton = document.createElement('button');
  submitButton.type = 'submit';
  submitButton.className =
    'inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800';
  submitButton.textContent = isEdit ? 'Save' : 'Create';

  modalFooterEl.append(cancelButton, submitButton);
  submitButton.addEventListener('click', () => {
    form.requestSubmit();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    submitButton.disabled = true;
    submitButton.classList.add('opacity-75');
    try {
      if (isEdit && customer) {
        await window.shellyManager.customers.update({
          id: customer.id,
          ...payload
        });
        window.location.reload();
        return;
      } else {
        await window.shellyManager.customers.create(payload);
        showToast({ title: 'Customer created', message: 'The customer has been added.', variant: 'success' });
      }
      closeModal();
      await loadCustomers();
    } catch (error) {
      submitButton.disabled = false;
      submitButton.classList.remove('opacity-75');
      showToast({
        title: 'Action failed',
        message: error.message || 'An unexpected error occurred.',
        variant: 'danger'
      });
    }
  });

  const nameInput = form.querySelector('input[name="name"]');
  if (nameInput) {
    nameInput.focus();
  }
  refreshIcons(modalBodyEl);
}

async function handleDeleteCustomer(customerId) {
  const customer = getCustomerById(customerId);
  if (!customer) {
    return;
  }
  const confirmed = await showConfirmModal({
    title: 'Delete customer',
    message: `Are you sure you want to delete ${customer.name}? This cannot be undone.`,
    confirmLabel: 'Delete',
    variant: 'danger'
  });
  if (!confirmed) {
    return;
  }
  try {
    await window.shellyManager.customers.delete(customerId);
    showToast({ title: 'Customer removed', message: `${customer.name} has been deleted.`, variant: 'success' });
    if (state.selectedCustomerId === customerId) {
      state.selectedCustomerId = null;
      showCustomersListView();
    }
    await loadCustomers();
  } catch (error) {
    showToast({
      title: 'Deletion failed',
      message: error.message || 'Could not delete customer.',
      variant: 'danger'
    });
  }
}

async function loadScans(customerId) {
  const scans = await window.shellyManager.scans.list(customerId);
  state.scans = scans;
}

async function loadDevices(customerId) {
  const devices = await window.shellyManager.devices.list(customerId);
  state.devices = devices;
  setSelectedDeviceIds();
  state.devicePowerTransitions = new Set();
  state.isBulkProcessing = false;
}

async function loadCustomerData(customerId) {
  await Promise.all([
    loadScans(customerId),
    loadDevices(customerId),
    refreshCurrentWifiSsid()
  ]);
}

function getScanSortValue(scan, column) {
  switch (column) {
    case 'id':
      return Number(scan.id) || 0;
    case 'startedAt':
      return scan.startedAt ? Date.parse(scan.startedAt) || 0 : 0;
    case 'completedAt':
      return scan.completedAt ? Date.parse(scan.completedAt) || 0 : 0;
    case 'totalDevices':
      return Number(scan.totalDevices) || 0;
    default:
      return 0;
  }
}
function renderScansTable(container) {
  const query = normalize(state.scanSearchQuery);
  const filteredScans = state.scans.filter((scan) => {
    if (!query) {
      return true;
    }
    const completed = scan.completedAt ? new Date(scan.completedAt).toLocaleString() : 'Bezig';
    const started = scan.startedAt ? new Date(scan.startedAt).toLocaleString() : '';
    return [scan.id, started, completed, scan.totalDevices]
      .map((value) => normalize(value))
      .some((value) => value.includes(query));
  });

  if (!filteredScans.length) {
    container.innerHTML = `
      <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-8 text-center">
        <p class="text-sm text-slate-500">No scans found${query ? ' for this search.' : '.'}</p>
      </div>
    `;
    return;
  }

  const sortedScans = [...filteredScans].sort((a, b) => {
    const valueA = getScanSortValue(a, state.scanSort.column);
    const valueB = getScanSortValue(b, state.scanSort.column);
    if (valueA < valueB) {
      return -1;
    }
    if (valueA > valueB) {
      return 1;
    }
    return 0;
  });
  if (state.scanSort.direction === 'desc') {
    sortedScans.reverse();
  }

  const rows = sortedScans
    .map((scan) => {
      const completed = scan.completedAt ? new Date(scan.completedAt).toLocaleString() : 'In progress';
      const started = new Date(scan.startedAt).toLocaleString();
      return `
        <tr class="hover:bg-slate-50">
          <td class="whitespace-nowrap px-4 py-3 text-sm text-slate-600">${escapeHtml(scan.id)}</td>
          <td class="whitespace-nowrap px-4 py-3 text-sm text-slate-600">${escapeHtml(started)}</td>
          <td class="whitespace-nowrap px-4 py-3 text-sm text-slate-600">${escapeHtml(completed)}</td>
          <td class="whitespace-nowrap px-4 py-3 text-sm font-semibold text-slate-700">${scan.totalDevices || 0}</td>
          <td class="px-4 py-3">
            <div class="flex items-center justify-end gap-2">
              <button
                type="button"
                class="rounded-lg border border-slate-200 bg-white p-2 text-rose-500 shadow-sm transition hover:bg-rose-50 hover:text-rose-600"
                data-scan-action="delete"
                data-scan-id="${scan.id}"
                title="Delete scan"
              >
                <span data-feather="trash-2"></span>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="overflow-hidden rounded-xl border border-slate-200">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" class="px-4 py-3 text-left" data-sort="id" data-label="ID">ID</th>
            <th scope="col" class="px-4 py-3 text-left" data-sort="startedAt" data-label="Started">Started</th>
            <th scope="col" class="px-4 py-3 text-left" data-sort="completedAt" data-label="Completed">Completed</th>
            <th scope="col" class="px-4 py-3 text-left" data-sort="totalDevices" data-label="Devices">Devices</th>
            <th scope="col" class="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 bg-white">
          ${rows}
        </tbody>
      </table>
    </div>
  `;

  const headerCells = container.querySelectorAll('th[data-sort]');
  updateHeaderSortIndicators(headerCells, state.scanSort);
  headerCells.forEach((cell) => {
    cell.addEventListener('click', () => {
      state.scanSort = toggleSort(state.scanSort, cell.dataset.sort);
      renderScansTable(container);
    });
  });

  const actionButtons = container.querySelectorAll('[data-scan-action]');
  actionButtons.forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      await handleScanAction(button.dataset.scanAction, Number(button.dataset.scanId));
    });
  });

  refreshIcons(container);
}

async function handleScanAction(action, scanId) {
  if (action !== 'delete' || Number.isNaN(scanId)) {
    return;
  }
  const confirmed = await showConfirmModal({
    title: 'Delete scan',
    message: 'Are you sure you want to delete this scan and all related snapshots?',
    confirmLabel: 'Delete',
    variant: 'danger'
  });
  if (!confirmed) {
    return;
  }
  try {
    await window.shellyManager.scans.delete(scanId);
    showToast({
      title: 'Scan deleted',
      message: 'The scan and its snapshots have been removed.',
      variant: 'success'
    });
    if (state.selectedCustomerId) {
      await loadCustomerData(state.selectedCustomerId);
      const customer = getCustomerById(state.selectedCustomerId);
      if (customer) {
        renderCustomerDetailPage(customer);
      }
    }
  } catch (error) {
    showToast({
      title: 'Deletion failed',
      message: error.message || 'Could not delete the scan.',
      variant: 'danger'
    });
  }
}

function getDeviceName(device) {
  return device.hostname || device.deviceIdentifier || '';
}

function getDeviceSortValue(device, column) {
  switch (column) {
    case 'name':
      return normalize(getDeviceName(device));
    case 'mac':
      return normalize(device.mac);
    case 'ip':
      return getIpTailValue(device.lastIp);
    case 'firmware':
      return normalize(device.firmwareVersion);
    case 'wifi':
      return normalize(device.wifiSsid);
    case 'app':
      return normalize(device.app);
    case 'generation':
      return normalize(device.generation);
    case 'installDate':
      return device.installDate ? Date.parse(device.installDate) || 0 : 0;
    case 'uptime':
      return device.uptime ? Number(device.uptime) || 0 : 0;
    default:
      return '';
  }
}

function getIpTailValue(ipAddress) {
  if (!ipAddress || typeof ipAddress !== 'string') {
    return 0;
  }
  const tail = ipAddress.split('.').pop() || '';
  const numericTail = Number(tail.replace(/\D/g, ''));
  if (!Number.isFinite(numericTail)) {
    return 0;
  }
  return numericTail % 1000;
}

function formatUptime(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '-';
  }
  const units = [
    { label: 'd', value: 86400 },
    { label: 'h', value: 3600 },
    { label: 'm', value: 60 }
  ];
  let remaining = Math.floor(seconds);
  const parts = [];
  units.forEach((unit) => {
    if (remaining >= unit.value) {
      const amount = Math.floor(remaining / unit.value);
      remaining -= amount * unit.value;
      parts.push(`${amount}${unit.label}`);
    }
  });
  if (!parts.length) {
    parts.push(`${remaining}s`);
  }
  return parts.slice(0, 2).join(' ');
}

function formatInstallDate(value) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  try {
    return date.toLocaleDateString('en-GB');
  } catch (_error) {
    return date.toISOString().split('T')[0];
  }
}

function formatRssi(value) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  return `${number} dBm`;
}

function getRssiQualityClass(value) {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    return 'text-slate-500';
  }
  if (number >= -55) {
    return 'text-emerald-500';
  }
  if (number >= -65) {
    return 'text-amber-500';
  }
  return 'text-rose-500';
}

function renderWifiStatusIcon(ssid, rssi) {
  const hasSsid = Boolean(ssid);
  const iconColorClass = hasSsid ? 'text-emerald-500' : 'text-slate-400';
  const icon = hasSsid ? 'wifi' : 'wifi-off';
  const rssiText = formatRssi(rssi);
  const labelParts = [];
  if (hasSsid) {
    labelParts.push(`Connected to ${ssid}`);
  } else {
    labelParts.push('No Wi-Fi information available');
  }
  if (rssiText) {
    labelParts.push(`Signal ${rssiText}`);
  }
  const label = labelParts.join(' | ');
  const rssiBadge = rssiText
    ? `<span class="text-xs font-semibold ${getRssiQualityClass(rssi)}">${escapeHtml(rssiText)}</span>`
    : '';
  return `
    <span class="inline-flex items-center gap-1" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
      <span data-feather="${icon}" class="h-4 w-4 ${iconColorClass}"></span>
      ${rssiBadge}
    </span>
  `;
}

function renderDevicesTable(container) {
  pruneSelectedDeviceIds();
  const query = normalize(state.deviceSearchQuery);
  const filteredDevices = state.devices.filter((device) => {
    if (!query) {
      return true;
    }
    return [
      getDeviceName(device),
      device.mac,
      device.lastIp,
      device.firmwareVersion,
      device.app,
      device.generation,
      device.wifiSsid,
      device.installDate,
      formatInstallDate(device.installDate),
      device.diffStatus || device.status,
      device.uptime,
      device.rssi
    ].some((value) => normalize(value).includes(query));
  });

  const sortedDevices = [...filteredDevices].sort((a, b) => {
    const valueA = getDeviceSortValue(a, state.deviceSort.column);
    const valueB = getDeviceSortValue(b, state.deviceSort.column);
    if (valueA < valueB) {
      return -1;
    }
    if (valueA > valueB) {
      return 1;
    }
    return 0;
  });
  if (state.deviceSort.direction === 'desc') {
    sortedDevices.reverse();
  }

  const isProcessing = Boolean(state.isBulkProcessing);
  const selectionCount = state.selectedDeviceIds.size;
  const filteredSelectionCount = filteredDevices.reduce(
    (count, device) => count + (state.selectedDeviceIds.has(device.id) ? 1 : 0),
    0
  );
  const allFilteredSelected =
    filteredDevices.length > 0 && filteredSelectionCount === filteredDevices.length;
  const someFilteredSelected = filteredSelectionCount > 0 && !allFilteredSelected;
  const headerCheckboxDisabled = isProcessing || filteredDevices.length === 0;

  const selectionText = isProcessing
    ? 'Running bulk action...'
    : selectionCount
    ? `${selectionCount} device${selectionCount === 1 ? '' : 's'} selected`
    : 'Select devices to enable bulk actions';

  const noResultsRow = `
        <tr>
          <td colspan="11" class="px-4 py-10 text-center text-sm text-slate-500">
            No devices found${query ? ' for this search.' : '.'}
          </td>
        </tr>
      `;

  const rows = sortedDevices.length
    ? sortedDevices
        .map((device) => {
          const uptime = formatUptime(device.uptime);
          const isOffline =
            device.status === 'offline' ||
            device.diffStatus === 'offline' ||
            device.isOnline === false;
          const rowClass = isOffline ? 'opacity-60' : '';
          const strongTextClass = isOffline ? 'text-slate-500' : 'text-slate-800';
          const textClass = isOffline ? 'text-slate-500' : 'text-slate-600';
          const nameContent = escapeHtml(getDeviceName(device));
          const nameButton =
            device.lastIp && nameContent
              ? `<button type="button" data-device-action="open-web" data-device-id="${device.id}" class="inline-flex items-center font-semibold ${strongTextClass} hover:text-slate-900 hover:underline underline-offset-2">
                    ${nameContent}
                  </button>`
              : `<span class="font-semibold ${strongTextClass}">${nameContent || '-'}</span>`;
          const isSelected = state.selectedDeviceIds.has(device.id);
          const checkboxDisabledAttr = isProcessing ? 'disabled' : '';
          const checkboxCheckedAttr = isSelected ? 'checked' : '';
          const actionDisabledAttr = isProcessing ? 'disabled' : '';
          const actionButtonClass = `rounded-lg border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition ${
            isProcessing ? 'cursor-not-allowed opacity-50' : 'hover:bg-slate-100 hover:text-slate-700'
          }`;
          const isPowerPending = state.devicePowerTransitions.has(device.id);
          const rawPowerState = device.powerState;
          const normalizedPowerState =
            !isOffline && (rawPowerState === 'on' || rawPowerState === 'off')
              ? rawPowerState
              : null;
          const powerStateAttr = normalizedPowerState || (isOffline ? 'offline' : 'unknown');
          const canTogglePower = !isProcessing && !isOffline && !isPowerPending;
          const powerButtonDisabledAttr = canTogglePower ? '' : 'disabled';
          let powerButtonClass = 'rounded-lg border p-2 shadow-sm transition ';
          if (isOffline) {
            powerButtonClass += 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400';
          } else if (isPowerPending) {
            powerButtonClass += 'cursor-wait border-slate-200 bg-slate-100 text-slate-500';
          } else if (normalizedPowerState === 'on') {
            powerButtonClass +=
              'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600 hover:border-emerald-600';
          } else if (normalizedPowerState === 'off') {
            powerButtonClass +=
              'border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-700';
          } else {
            powerButtonClass +=
              'border-slate-200 bg-white text-slate-400 hover:bg-slate-100 hover:text-slate-600';
          }
          const powerButtonTitle = isOffline
            ? 'Device offline'
            : isPowerPending
            ? 'Toggling power...'
            : normalizedPowerState === 'on'
            ? 'Turn off'
            : normalizedPowerState === 'off'
            ? 'Turn on'
            : 'Toggle power (state unknown)';
          const powerIcon = isPowerPending ? 'loader' : 'power';
          const powerIconClass = isPowerPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4';
          return `
            <tr class="hover:bg-slate-50 ${rowClass}">
              <td class="px-4 py-3">
                <div class="flex justify-center">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-slate-300 text-slate-600 focus:ring-slate-400"
                    data-device-select="device"
                    data-device-id="${device.id}"
                    ${checkboxCheckedAttr}
                    ${checkboxDisabledAttr}
                  />
                </div>
              </td>
              <td class="whitespace-nowrap px-4 py-3 text-sm">${nameButton}</td>
              <td class="px-4 py-3 text-sm ${textClass}">${escapeHtml(device.mac || '-')}</td>
              <td class="px-4 py-3 text-sm ${textClass}">${escapeHtml(device.lastIp || '-')}</td>
              <td class="px-4 py-3 text-sm ${textClass}">${escapeHtml(device.firmwareVersion || '-')}</td>
              <td class="px-4 py-3 text-sm ${textClass}">${escapeHtml(device.app || '-')}</td>
              <td class="px-4 py-3 text-sm ${textClass}">${escapeHtml(device.generation || '-')}</td>
              <td class="px-4 py-3">${renderWifiStatusIcon(device.wifiSsid, device.rssi)}</td>
              <td class="px-4 py-3 text-sm ${textClass}">${escapeHtml(formatInstallDate(device.installDate))}</td>
              <td class="px-4 py-3 text-sm ${textClass}">${escapeHtml(uptime)}</td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    class="${powerButtonClass}"
                    data-device-action="toggle-power"
                    data-device-id="${device.id}"
                    data-power-state="${escapeHtml(powerStateAttr)}"
                    title="${escapeHtml(powerButtonTitle)}"
                    ${powerButtonDisabledAttr}
                  >
                    <span data-feather="${powerIcon}" class="${powerIconClass}"></span>
                  </button>
                  <button
                    type="button"
                    class="${actionButtonClass}"
                    data-device-action="edit"
                    data-device-id="${device.id}"
                    title="Edit"
                    ${actionDisabledAttr}
                  >
                    <span data-feather="edit-3"></span>
                  </button>
                  <button
                    type="button"
                    class="${actionButtonClass}"
                    data-device-action="open-web"
                    data-device-id="${device.id}"
                    title="Open web interface"
                    ${actionDisabledAttr}
                  >
                    <span data-feather="external-link"></span>
                  </button>
                  <button
                    type="button"
                    class="${actionButtonClass}"
                    data-device-action="wifi"
                    data-device-id="${device.id}"
                    title="Configure Wi-Fi"
                    ${actionDisabledAttr}
                  >
                    <span data-feather="wifi"></span>
                  </button>
                  <button
                    type="button"
                    class="${actionButtonClass}"
                    data-device-action="firmware"
                    data-device-id="${device.id}"
                    title="Firmware update"
                    ${actionDisabledAttr}
                  >
                    <span data-feather="download-cloud"></span>
                  </button>
                  <button
                    type="button"
                    class="${actionButtonClass}"
                    data-device-action="reboot"
                    data-device-id="${device.id}"
                    title="Reboot device"
                    ${actionDisabledAttr}
                  >
                    <span data-feather="refresh-cw"></span>
                  </button>
                </div>
              </td>
            </tr>
          `;
        })
        .join('')
    : noResultsRow;

  const bulkDisabledClass =
    state.isBulkProcessing || selectionCount === 0 ? 'cursor-not-allowed opacity-60' : 'hover:bg-slate-100 hover:text-slate-700';
  const bulkDisabledAttr = state.isBulkProcessing || selectionCount === 0 ? 'disabled' : '';
  const clearDisabled = state.isBulkProcessing || selectionCount === 0;

  container.innerHTML = `
    <div class="overflow-hidden rounded-xl border border-slate-200">
      <div class="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
        <div class="font-medium text-slate-600">${escapeHtml(selectionText)}</div>
        <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition ${bulkDisabledClass}"
            data-bulk-action="bulk-firmware"
            ${bulkDisabledAttr}
          >
            <span data-feather="download-cloud" class="h-4 w-4"></span>
            Firmware
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition ${bulkDisabledClass}"
            data-bulk-action="bulk-wifi1"
            ${bulkDisabledAttr}
          >
            <span data-feather="wifi" class="h-4 w-4"></span>
            Wi-Fi 1
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition ${bulkDisabledClass}"
            data-bulk-action="bulk-wifi2"
            ${bulkDisabledAttr}
          >
            <span data-feather="wifi" class="h-4 w-4"></span>
            Wi-Fi 2
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 shadow-sm transition ${
              state.isBulkProcessing || selectionCount === 0 ? 'cursor-not-allowed opacity-60' : 'hover:bg-rose-50 hover:text-rose-600'
            }"
            data-bulk-action="bulk-delete"
            ${bulkDisabledAttr}
          >
            <span data-feather="trash-2" class="h-4 w-4"></span>
            Delete
          </button>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition ${
              clearDisabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-slate-100 hover:text-slate-700'
            }"
            data-clear-selection
            ${clearDisabled ? 'disabled' : ''}
          >
            <span data-feather="x-circle" class="h-4 w-4"></span>
            Clear
          </button>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" class="w-12 px-4 py-3 text-center">
                <div class="flex justify-center">
                  <input
                    type="checkbox"
                    class="h-4 w-4 rounded border-slate-300 text-slate-600 focus:ring-slate-400"
                    data-device-select="all"
                    ${allFilteredSelected ? 'checked' : ''}
                    ${headerCheckboxDisabled ? 'disabled' : ''}
                  />
                </div>
              </th>
              <th scope="col" class="px-4 py-3 text-left" data-sort="name" data-label="Name">Name</th>
              <th scope="col" class="px-4 py-3 text-left" data-sort="mac" data-label="MAC">MAC</th>
              <th scope="col" class="px-4 py-3 text-left" data-sort="ip" data-label="IP">IP</th>
              <th scope="col" class="px-4 py-3 text-left" data-sort="firmware" data-label="Firmware">Firmware</th>
              <th scope="col" class="px-4 py-3 text-left" data-sort="app" data-label="App">App</th>
              <th scope="col" class="px-4 py-3 text-left" data-sort="generation" data-label="Generation">Gen</th>
              <th scope="col" class="px-4 py-3 text-left" data-sort="wifi" data-label="Wi-Fi">Wi-Fi</th>
              <th scope="col" class="px-4 py-3 text-left" data-sort="installDate" data-label="Install date">Install date</th>
              <th scope="col" class="px-4 py-3 text-left" data-sort="uptime" data-label="Uptime">Uptime</th>
              <th scope="col" class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 bg-white">
            ${rows}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const headerCheckbox = container.querySelector('[data-device-select="all"]');
  if (headerCheckbox) {
    headerCheckbox.indeterminate = someFilteredSelected;
    headerCheckbox.addEventListener('change', () => {
      if (state.isBulkProcessing) {
        headerCheckbox.checked = allFilteredSelected;
        return;
      }
      if (headerCheckbox.checked) {
        filteredDevices.forEach((device) => state.selectedDeviceIds.add(device.id));
      } else {
        filteredDevices.forEach((device) => state.selectedDeviceIds.delete(device.id));
      }
      renderDevicesTable(container);
    });
  }

  const rowCheckboxes = container.querySelectorAll('[data-device-select="device"]');
  rowCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const deviceId = Number(checkbox.dataset.deviceId);
      if (Number.isNaN(deviceId) || state.isBulkProcessing) {
        checkbox.checked = state.selectedDeviceIds.has(deviceId);
        return;
      }
      if (checkbox.checked) {
        state.selectedDeviceIds.add(deviceId);
      } else {
        state.selectedDeviceIds.delete(deviceId);
      }
      renderDevicesTable(container);
    });
  });

  const bulkButtons = container.querySelectorAll('[data-bulk-action]');
  bulkButtons.forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      if (!button.dataset.bulkAction || button.disabled) {
        return;
      }
      await handleBulkAction(button.dataset.bulkAction);
    });
  });

  const clearButton = container.querySelector('[data-clear-selection]');
  if (clearButton) {
    clearButton.addEventListener('click', () => {
      if (state.isBulkProcessing || state.selectedDeviceIds.size === 0) {
        return;
      }
      setSelectedDeviceIds();
      renderDevicesTable(container);
    });
  }

  const headerCells = container.querySelectorAll('th[data-sort]');
  updateHeaderSortIndicators(headerCells, state.deviceSort);
  headerCells.forEach((cell) => {
    cell.addEventListener('click', () => {
      state.deviceSort = toggleSort(state.deviceSort, cell.dataset.sort);
      renderDevicesTable(container);
    });
  });

  const actionButtons = container.querySelectorAll('[data-device-action]');
  actionButtons.forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      if (button.disabled) {
        return;
      }
      await handleDeviceAction(button.dataset.deviceAction, Number(button.dataset.deviceId));
    });
  });

  refreshIcons(container);
}

async function handleDeviceAction(action, deviceId) {
  const device = state.devices.find((item) => item.id === deviceId);
  if (!device) {
    showToast({ title: 'Unknown device', message: 'Could not find the selected device.', variant: 'danger' });
    return;
  }
  const customerId = state.selectedCustomerId;
  if (!customerId) {
    return;
  }

  try {
    if (action === 'edit') {
      await openDeviceEditModal(device);
      return;
    } else if (action === 'open-web') {
      if (!device.lastIp) {
        showToast({ title: 'No IP address', message: 'No IP address available for this device.', variant: 'warning' });
        return;
      }
      await window.shellyManager.actions.openWeb(device.lastIp);
    } else if (action === 'toggle-power') {
      if (!device.lastIp) {
        showToast({ title: 'No IP address', message: 'Cannot toggle power without an IP address.', variant: 'warning' });
        return;
      }
      state.devicePowerTransitions.add(device.id);
      renderDevicesTable(customerDevicesSectionEl);
      try {
        await window.shellyManager.actions.togglePower({
          ip: device.lastIp,
          metadata: { deviceId: device.id }
        });
        state.devicePowerTransitions.delete(device.id);
        await refreshDevicePowerStates([device]);
        renderDevicesTable(customerDevicesSectionEl);
        showToast({
          title: 'Power toggled',
          message: `${getDeviceName(device) || 'Device'} power toggle requested.`,
          variant: 'success'
        });
      } catch (error) {
        state.devicePowerTransitions.delete(device.id);
        renderDevicesTable(customerDevicesSectionEl);
        throw error;
      }
      return;
    } else if (action === 'wifi') {
      if (!device.lastIp) {
        showToast({ title: 'No IP address', message: 'No IP address available for this device.', variant: 'warning' });
        return;
      }
      const result = await showInputModal({
        title: `Configure Wi-Fi (${getDeviceName(device)})`,
        description: 'Apply Wi-Fi settings to the selected device.',
        fields: [
          { name: 'ssid', label: 'SSID', value: state.customers.find((c) => c.id === customerId)?.wifiSsid || '', required: true },
          { name: 'password', label: 'Password', value: state.customers.find((c) => c.id === customerId)?.wifiPassword || '', required: false }
        ]
      });
      if (!result) {
        await openCustomerDetail(customerId);
        return;
      }
      await window.shellyManager.actions.wifi({
        ip: device.lastIp,
        ssid: result.ssid,
        password: result.password,
        metadata: { deviceId: device.id }
      });
      showToast({ title: 'Wi-Fi configured', message: 'Wi-Fi configuration sent to device.', variant: 'success' });
      await openCustomerDetail(customerId);
      return;
    } else if (action === 'firmware') {
      if (!device.lastIp) {
        showToast({ title: 'No IP address', message: 'No IP address available for this device.', variant: 'warning' });
        return;
      }
      const result = await showInputModal({
        title: `Firmware update (${getDeviceName(device)})`,
        description: 'Provide the OTA firmware URL to start an update.',
        fields: [{ name: 'otaUrl', label: 'OTA URL', required: true, placeholder: 'https://...' }]
      });
      if (!result) {
        await openCustomerDetail(customerId);
        return;
      }
      await window.shellyManager.actions.firmware({
        ip: device.lastIp,
        otaUrl: result.otaUrl,
        metadata: { deviceId: device.id }
      });
      showToast({ title: 'Firmware update started', message: 'The update was triggered for this device.', variant: 'success' });
      await openCustomerDetail(customerId);
      return;
    } else if (action === 'reboot') {
      const confirm = await showConfirmModal({
        title: `Reboot ${getDeviceName(device)}`,
        message: 'Are you sure you want to reboot this device?',
        confirmLabel: 'Reboot'
      });
      if (!confirm) {
        return;
      }
      await window.shellyManager.actions.reboot({
        ip: device.lastIp,
        metadata: { deviceId: device.id }
      });
      showToast({ title: 'Reboot sent', message: 'The device is rebooting.', variant: 'success' });
    }
  } catch (error) {
    showToast({
      title: 'Action failed',
      message: error.message || 'The action could not be completed.',
      variant: 'danger'
    });
  }
}

async function handleBulkAction(action) {
  if (state.isBulkProcessing) {
    return;
  }
  const customerId = state.selectedCustomerId;
  if (!customerId) {
    return;
  }
  const selectedDevices = getSelectedDevices();
  if (!selectedDevices.length) {
    showToast({
      title: 'No devices selected',
      message: 'Select at least one device to run a bulk action.',
      variant: 'warning'
    });
    return;
  }

  const customer = getCustomerById(customerId);
  let userInput = null;
  if (action === 'bulk-firmware') {
    userInput = await showInputModal({
      title: 'Bulk firmware update',
      description: `Start a firmware update for ${selectedDevices.length} device${
        selectedDevices.length === 1 ? '' : 's'
      }.`,
      fields: [{ name: 'otaUrl', label: 'OTA URL', required: true, placeholder: 'https://...' }],
      submitLabel: 'Update firmware',
      size: 'md'
    });
    if (!userInput) {
      return;
    }
  } else if (action === 'bulk-wifi1' || action === 'bulk-wifi2') {
    const networkLabel = action === 'bulk-wifi1' ? 'Wi-Fi network 1' : 'Wi-Fi network 2';
    const defaultSsid = action === 'bulk-wifi1' ? customer?.wifiSsid || '' : '';
    const defaultPassword = action === 'bulk-wifi1' ? customer?.wifiPassword || '' : '';
    userInput = await showInputModal({
      title: `Bulk ${networkLabel}`,
      description: `Push ${networkLabel} settings to ${selectedDevices.length} device${
        selectedDevices.length === 1 ? '' : 's'
      }.`,
      fields: [
        { name: 'ssid', label: 'SSID', value: defaultSsid, required: true },
        { name: 'password', label: 'Password', value: defaultPassword, required: false, type: 'password' }
      ],
      submitLabel: 'Apply Wi-Fi',
      size: 'md'
    });
    if (!userInput) {
      return;
    }
  } else if (action === 'bulk-delete') {
    const confirmed = await showConfirmModal({
      title: 'Delete selected devices',
      message: `Are you sure you want to delete ${selectedDevices.length} device${
        selectedDevices.length === 1 ? '' : 's'
      }? This cannot be undone.`,
      confirmLabel: 'Delete devices',
      variant: 'danger'
    });
    if (!confirmed) {
      return;
    }
  } else {
    return;
  }

  state.isBulkProcessing = true;
  renderDevicesTable(customerDevicesSectionEl);

  const results = { success: [], failed: [] };

  try {
    if (action === 'bulk-firmware') {
      for (const device of selectedDevices) {
        if (!device.lastIp) {
          results.failed.push({ device, reason: 'No IP address' });
          continue;
        }
        try {
          await window.shellyManager.actions.firmware({
            ip: device.lastIp,
            otaUrl: userInput.otaUrl,
            metadata: { deviceId: device.id }
          });
          results.success.push(device);
        } catch (error) {
          results.failed.push({ device, reason: getErrorMessage(error) });
        }
      }
    } else if (action === 'bulk-wifi1' || action === 'bulk-wifi2') {
      const networkKey = action === 'bulk-wifi1' ? 'wifi1' : 'wifi2';
      for (const device of selectedDevices) {
        if (!device.lastIp) {
          results.failed.push({ device, reason: 'No IP address' });
          continue;
        }
        try {
          await window.shellyManager.actions.wifi({
            ip: device.lastIp,
            ssid: userInput.ssid,
            password: userInput.password,
            network: networkKey,
            metadata: { deviceId: device.id }
          });
          results.success.push(device);
        } catch (error) {
          results.failed.push({ device, reason: getErrorMessage(error) });
        }
      }
    } else if (action === 'bulk-delete') {
      for (const device of selectedDevices) {
        try {
          await window.shellyManager.devices.delete(device.id);
          results.success.push(device);
        } catch (error) {
          results.failed.push({ device, reason: getErrorMessage(error) });
        }
      }
    }
  } finally {
    state.isBulkProcessing = false;
  }

  let failedIds = results.failed.map(({ device }) => device.id);
  if (action === 'bulk-delete') {
    try {
      await loadDevices(customerId);
    } catch (error) {
      showToast({
        title: 'Refresh failed',
        message: getErrorMessage(error),
        variant: 'warning'
      });
    }
    const existingIds = new Set(state.devices.map((device) => device.id));
    failedIds = failedIds.filter((id) => existingIds.has(id));
  }

  if (failedIds.length) {
    setSelectedDeviceIds(failedIds);
  } else {
    setSelectedDeviceIds();
  }

  renderDevicesTable(customerDevicesSectionEl);

  const successCount = results.success.length;
  const failedCount = results.failed.length;
  const actionLabels = {
    'bulk-firmware': 'Firmware update',
    'bulk-wifi1': 'Wi-Fi 1 update',
    'bulk-wifi2': 'Wi-Fi 2 update',
    'bulk-delete': 'Device removal'
  };
  const label = actionLabels[action] || 'Bulk action';
  if (failedCount) {
    const firstFailure = results.failed[0];
    const detail = firstFailure
      ? `${getDeviceName(firstFailure.device) || 'Device'}: ${firstFailure.reason}`
      : '';
    showToast({
      title: `${label} completed`,
      message: `${successCount} succeeded, ${failedCount} failed${detail ? ` (${detail})` : ''}.`,
      variant: 'warning'
    });
  } else {
    showToast({
      title: `${label} completed`,
      message: `${successCount} device${successCount === 1 ? '' : 's'} processed successfully.`,
      variant: 'success'
    });
  }
}


async function openDeviceEditModal(device) {
  const customer = state.customers.find((c) => c.id === state.selectedCustomerId);
  if (!customer) {
    return;
  }
  const onNetwork = isOnCustomerNetwork(customer);
  let settings = {
    name: getDeviceName(device) || device.deviceIdentifier || '',
    apEnabled: false,
    ecoMode: false
  };
  let settingsError = null;
  if (onNetwork && device.lastIp && window.shellyManager?.devices?.fetchSettings) {
    try {
      const fetched = await window.shellyManager.devices.fetchSettings({ ip: device.lastIp });
      if (fetched && typeof fetched === 'object') {
        settings = {
          name: fetched.name ?? settings.name,
          apEnabled: typeof fetched.apEnabled === 'boolean' ? fetched.apEnabled : settings.apEnabled,
          ecoMode: typeof fetched.ecoMode === 'boolean' ? fetched.ecoMode : settings.ecoMode
        };
      }
    } catch (error) {
      settingsError = error.message || 'Failed to fetch current settings.';
    }
  }

  const installDateValue = device.installDate
    ? (device.installDate.includes('T') ? device.installDate.split('T')[0] : device.installDate)
    : '';

  openModal({
    title: getDeviceName(device) || device.deviceIdentifier || 'Device',
    subtitle: device.lastIp ? `IP: ${device.lastIp}` : '',
    size: 'md'
  });

  const disableShellyControls = !onNetwork || !device.lastIp;
  modalBodyEl.innerHTML = `
    ${!onNetwork ? '<div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">Connect to the customer network to change Shelly settings.</div>' : ''}
    <form id="device-edit-form" class="space-y-4">
      <div class="space-y-2 text-sm">
        <label class="font-medium text-slate-700" for="install-date">Install date</label>
        <input
          id="install-date"
          name="installDate"
          type="date"
          value="${escapeHtml(installDateValue)}"
          class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-300"
        />
      </div>
      <fieldset class="space-y-3 ${disableShellyControls ? 'opacity-60' : ''}" ${disableShellyControls ? 'disabled' : ''}>
        <legend class="text-sm font-medium text-slate-700">Shelly settings</legend>
        <div class="space-y-2 text-sm">
          <label class="font-medium text-slate-700" for="device-name">Name</label>
          <input
            id="device-name"
            name="name"
            type="text"
            value="${escapeHtml(settings.name || '')}"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-300"
          />
        </div>
        <label class="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="apEnabled" ${settings.apEnabled ? 'checked' : ''} class="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400" />
          Access point enabled
        </label>
        <label class="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="ecoMode" ${settings.ecoMode ? 'checked' : ''} class="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400" />
          Eco mode
        </label>
      </fieldset>
      ${settingsError ? `<p class="text-xs text-rose-600">${escapeHtml(settingsError)}</p>` : ''}
    </form>
  `;
  refreshIcons(modalBodyEl);

  modalFooterEl.innerHTML = '';
  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className =
    'inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-100';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', () => closeModal());

  const saveButton = document.createElement('button');
  saveButton.type = 'submit';
  saveButton.className =
    'inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800';
  saveButton.textContent = 'Save';

  modalFooterEl.append(cancelButton, saveButton);

  const form = document.getElementById('device-edit-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    saveButton.disabled = true;
    try {
      const formData = new FormData(form);
      const installDateInput = formData.get('installDate');
      const normalizedInstallDate = installDateInput ? installDateInput.toString() : null;
      const originalInstallDate = device.installDate
        ? (device.installDate.includes('T') ? device.installDate.split('T')[0] : device.installDate)
        : null;
      if (normalizedInstallDate !== originalInstallDate) {
        await window.shellyManager.devices.updateMetadata({
          deviceId: device.id,
          customerId: customer.id,
          installDate: normalizedInstallDate
        });
      }

      if (!disableShellyControls && device.lastIp) {
        const newName = (formData.get('name') || '').toString().trim();
        const apEnabled = form.querySelector('input[name="apEnabled"]').checked;
        const ecoMode = form.querySelector('input[name="ecoMode"]').checked;
        const settingsPayload = {};
        if (newName && newName !== (settings.name || '')) {
          settingsPayload.name = newName;
        }
        if (apEnabled !== !!settings.apEnabled) {
          settingsPayload.apEnabled = apEnabled;
        }
        if (ecoMode !== !!settings.ecoMode) {
          settingsPayload.ecoMode = ecoMode;
        }
        if (Object.keys(settingsPayload).length && window.shellyManager?.actions?.deviceSettings) {
          await window.shellyManager.actions.deviceSettings({
            ip: device.lastIp,
            settings: settingsPayload
          });
        } else if (Object.keys(settingsPayload).length) {
          showToast({
            title: 'Settings unavailable',
            message: 'Could not update Shelly settings because the action is not exposed.',
            variant: 'warning'
          });
        }
      }

      closeModal();
      await loadCustomerData(customer.id);
      const refreshed = getCustomerById(customer.id);
      renderCustomerDetailPage(refreshed);
      showToast({ title: 'Device updated', message: 'Changes saved.', variant: 'success' });
    } catch (error) {
      showToast({
        title: 'Update failed',
        message: error.message || 'Could not update device.',
        variant: 'danger'
      });
    } finally {
      saveButton.disabled = false;
    }
  });

  saveButton.addEventListener('click', () => {
    form.requestSubmit();
  });
}


async function exportDevices(customerId) {
  try {
    const result = await window.shellyManager.devices.export(customerId);
    if (result && result.canceled) {
      return;
    }
    showToast({
      title: 'Export completed',
      message: 'Device list exported.',
      variant: 'success'
    });
  } catch (error) {
    showToast({
      title: 'Export failed',
      message: error.message || 'Could not complete export.',
      variant: 'danger'
    });
  }
}

async function exportScans(customerId) {
  try {
    const result = await window.shellyManager.scans.export(customerId);
    if (result && result.canceled) {
      return;
    }
    showToast({
      title: 'Export completed',
      message: 'Scan history exported.',
      variant: 'success'
    });
  } catch (error) {
    showToast({
      title: 'Export failed',
      message: error.message || 'Could not complete export.',
      variant: 'danger'
    });
  }
}

async function handleScan(customer) {
  if (state.isScanning) {
    return;
  }
  const formResult = await showInputModal({
    title: `Network scan (${customer.name})`,
    description:
      'Start a new scan for this customer. Leave fields empty to use the default configuration.',
    fields: [
      {
        name: 'subnet',
        label: 'Subnet override',
        placeholder: customer.subnet || 'e.g. 192.168.1.0/24',
        value: ''
      },
      {
        name: 'ipList',
        label: 'Manual IP list (comma separated)',
        placeholder: '192.168.1.10,192.168.1.11'
      },
      {
        name: 'concurrency',
        label: 'Concurrency (1-100)',
        placeholder: '20'
      }
    ],
    size: 'lg',
    submitLabel: 'Start scan'
  });

  if (!formResult) {
    await openCustomerDetail(customer.id);
    return;
  }

  const payload = {
    customerId: customer.id
  };
  if (formResult.subnet) {
    payload.subnet = formResult.subnet;
  }
  if (formResult.ipList) {
    payload.ipList = formResult.ipList
      .split(',')
      .map((segment) => segment.trim())
      .filter(Boolean);
  }
  if (formResult.concurrency) {
    payload.concurrency = Number(formResult.concurrency);
  }

  state.isScanning = true;
  renderScanButtonState();
  try {
    const result = await window.shellyManager.scans.run(payload);
    showToast({
      title: 'Scan complete',
      message: `Targets: ${result.targetCount}. Devices discovered: ${result.results.length}.`,
      variant: 'success'
    });
    await loadCustomerData(customer.id);
    renderCustomerDetailPage(getCustomerById(customer.id) || customer);
  } catch (error) {
    showToast({
      title: 'Scan failed',
      message: error.message || 'Could not run the scan.',
      variant: 'danger'
    });
  } finally {
    state.isScanning = false;
    renderScanButtonState();
  }
}
function attachCopyHandler(container) {
  const copyButton = container.querySelector('[data-action="copy-password"]');
  if (!copyButton) {
    return;
  }
  copyButton.addEventListener('click', async () => {
    const password = copyButton.getAttribute('data-password');
    if (!password) {
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(password);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = password;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      copyButton.innerHTML = '<span data-feather="check"></span> Copied';
      copyButton.classList.add('bg-slate-900', 'text-white');
      refreshIcons(copyButton);
      setTimeout(() => {
        copyButton.innerHTML = '<span data-feather="clipboard"></span> Copy';
        copyButton.classList.remove('bg-slate-900', 'text-white');
        refreshIcons(copyButton);
      }, 2000);
    } catch (error) {
      showToast({
        title: 'Copy failed',
        message: 'Could not copy password.',
        variant: 'danger'
      });
    }
  });
}

function renderCustomerDetailPage(customer) {
  if (!customer) {
    return;
  }
  showCustomerDetailView();
  customerDetailTitleEl.textContent = customer.name;
  const subtitleParts = [];
  if (customer.contact) {
    subtitleParts.push(customer.contact);
  }
  customerDetailSubtitleEl.textContent = subtitleParts.join(' | ') || 'Customer details';
  customerDetailSubtitleEl.classList.toggle('hidden', subtitleParts.length === 0);

  customerScanBtn.onclick = async () => {
    const currentCustomer = getCustomerById(customer.id);
    if (currentCustomer) {
      await handleScan(currentCustomer);
    }
  };
  renderScanButtonState();

  if (customerLastScanEl) {
    if (state.scans.length) {
      const latestScan = state.scans.reduce((latest, scan) => {
        const latestTime = latest ? Date.parse(latest.startedAt) || 0 : 0;
        const currentTime = Date.parse(scan.startedAt) || 0;
        return currentTime > latestTime ? scan : latest;
      }, null);
      if (latestScan) {
        const completedTime = latestScan.completedAt || latestScan.startedAt;
        const formatted = completedTime ? new Date(completedTime).toLocaleString() : 'In progress';
        customerLastScanEl.textContent = `Last scan: ${formatted}`;
        customerLastScanEl.classList.remove('hidden');
      } else {
        customerLastScanEl.textContent = 'No scans yet';
        customerLastScanEl.classList.remove('hidden');
      }
    } else {
      customerLastScanEl.textContent = 'No scans yet';
      customerLastScanEl.classList.remove('hidden');
    }
  }

  customerEditBtn.onclick = async () => {
    const currentCustomer = getCustomerById(customer.id);
    if (!currentCustomer) {
      return;
    }
    await openCustomerFormModal('edit', currentCustomer);
    await loadCustomers();
    await openCustomerDetail(currentCustomer.id);
  };

  const detailEntries = [
    { label: 'Name', value: escapeHtml(customer.name) },
    { label: 'Description', value: escapeHtml(customer.description || '-') },
    { label: 'Contact', value: escapeHtml(customer.contact || '-') },
    {
      label: 'Default subnet',
      value: customer.subnet
        ? escapeHtml(customer.subnet)
        : '<span class="text-sm text-slate-500">Not set</span>'
    },
    { label: 'Wi-Fi SSID', value: createWifiStatusBadge(customer.wifiSsid, state.currentWifiSsid) },
    { label: 'Wi-Fi password', value: createMaskedPassword(customer.wifiPassword) }
  ];

  const detailMarkup = detailEntries
    .map(
      (entry) => `
        <div class="space-y-1">
          <dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">${entry.label}</dt>
          <dd class="text-sm text-slate-800">${entry.value}</dd>
        </div>
      `
    )
    .join('');

  customerInfoGridEl.innerHTML = `
    <div class="rounded-xl border border-slate-200/80 bg-white/90 p-6 shadow-sm">
      <dl class="grid gap-4 sm:grid-cols-2">
        ${detailMarkup}
      </dl>
    </div>
  `;

  attachCopyHandler(customerInfoGridEl);

  if (devicesSearchEl) {
    devicesSearchEl.value = state.deviceSearchQuery || '';
  }
  setSelectedDeviceIds();
  state.isBulkProcessing = false;
  renderDevicesTable(customerDevicesSectionEl);
  startPowerStatePolling({ immediate: true });

  if (scansSearchEl) {
    scansSearchEl.value = state.scanSearchQuery || '';
  }
  renderScansTable(customerScansSectionEl);

  refreshIcons(customerDetailViewEl);
}
async function openCustomerDetail(customerId) {
  const previousCustomerId = state.selectedCustomerId;
  const customer = getCustomerById(customerId);
  if (!customer) {
    showToast({
      title: 'Customer not found',
      message: 'Could not load the selected customer.',
      variant: 'danger'
    });
    return;
  }

  state.selectedCustomerId = customerId;
  if (previousCustomerId !== customerId) {
    state.deviceSearchQuery = '';
    state.scanSearchQuery = '';
  }
  if (devicesSearchEl) {
    devicesSearchEl.value = state.deviceSearchQuery;
  }
  if (scansSearchEl) {
    scansSearchEl.value = state.scanSearchQuery;
  }
  showCustomerDetailView();
  customerDetailTitleEl.textContent = customer.name;
  customerDetailSubtitleEl.textContent = 'Loading customer data...';
  customerDetailSubtitleEl.classList.remove('hidden');

  const loadingMarkup = `
    <div class="flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-4 py-10 text-sm text-slate-500">
      <span class="inline-flex items-center gap-2">
        <span data-feather="loader" class="h-4 w-4 animate-spin"></span>
        Loading
      </span>
    </div>
  `;

  customerInfoGridEl.innerHTML = loadingMarkup;
  customerScansSectionEl.innerHTML = loadingMarkup;
  customerDevicesSectionEl.innerHTML = loadingMarkup;
  refreshIcons(customerDetailViewEl);

  try {
    await loadCustomerData(customerId);
    const refreshedCustomer = getCustomerById(customerId) || customer;
    renderCustomerDetailPage(refreshedCustomer);
  } catch (error) {
    customerInfoGridEl.innerHTML = `
      <div class="rounded-xl border border-rose-200 bg-rose-50 px-6 py-10 text-center">
        <p class="text-sm font-semibold text-rose-700">Unable to load customer data.</p>
        <p class="mt-2 text-sm text-rose-600">${escapeHtml(error.message || 'Unknown error')}</p>
      </div>
    `;
    customerScansSectionEl.innerHTML = '';
    customerDevicesSectionEl.innerHTML = '';
    refreshIcons(customerDetailViewEl);
  }
}

customersTableBodyEl.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }
  const action = button.dataset.action;
  const customerId = Number(button.dataset.id);
  if (Number.isNaN(customerId)) {
    return;
  }
  if (action === 'view') {
    await openCustomerDetail(customerId);
  } else if (action === 'edit') {
    await openCustomerFormModal('edit', getCustomerById(customerId));
  } else if (action === 'delete') {
    await handleDeleteCustomer(customerId);
  }
});

if (customersTableHeaderEl) {
  customersTableHeaderEl.addEventListener('click', (event) => {
    const cell = event.target.closest('th[data-sort]');
    if (!cell) {
      return;
    }
    state.customerSort = toggleSort(state.customerSort, cell.dataset.sort);
    renderCustomersTable();
  });
  updateHeaderSortIndicators(customerHeaderCells, state.customerSort);
}
if (devicesSearchEl) {
  devicesSearchEl.addEventListener('input', (event) => {
    state.deviceSearchQuery = event.target.value || '';
    renderDevicesTable(customerDevicesSectionEl);
  });
}

if (scansSearchEl) {
  scansSearchEl.addEventListener('input', (event) => {
    state.scanSearchQuery = event.target.value || '';
    renderScansTable(customerScansSectionEl);
  });
}

if (autoScanToggleBtn) {
  autoScanToggleBtn.addEventListener('click', async () => {
    if (!window.shellyManager || !window.shellyManager.autoScan) {
      return;
    }
    const desiredEnabled = !state.autoScan.enabled;
    const previousMeta = autoScanMetaEl ? autoScanMetaEl.textContent : '';
    autoScanToggleBtn.disabled = true;
    if (autoScanMetaEl) {
      autoScanMetaEl.textContent = desiredEnabled ? 'Enabling...' : 'Disabling...';
    }
    try {
      const status = await window.shellyManager.autoScan.setEnabled(desiredEnabled);
      if (status) {
        updateAutoScanState(status);
      }
    } catch (error) {
      showToast({
        title: 'Auto checks',
        message: error.message || 'Could not update automatic checks.',
        variant: 'danger'
      });
      if (autoScanMetaEl) {
        autoScanMetaEl.textContent = previousMeta;
      }
    } finally {
      autoScanToggleBtn.disabled = false;
      renderAutoScanControls();
    }
  });
}

customerSearchEl.addEventListener('input', (event) => {
  state.searchQuery = event.target.value || '';
  renderCustomersTable();
});

newCustomerBtn.addEventListener('click', () => {
  openCustomerFormModal('create');
});

customerBackBtn.addEventListener('click', () => {
  state.selectedCustomerId = null;
  showCustomersListView();
  refreshIcons(document);
});

if (devicesExportBtn) {
  devicesExportBtn.addEventListener('click', async () => {
    if (!state.selectedCustomerId) {
      showToast({ title: 'No customer selected', message: 'Select a customer first.', variant: 'warning' });
      return;
    }
    await exportDevices(state.selectedCustomerId);
  });
}

function renderScanButtonState() {
  if (!customerScanBtn) {
    return;
  }
  if (state.isScanning) {
    customerScanBtn.disabled = true;
    customerScanBtn.classList.add('opacity-80', 'cursor-not-allowed');
    customerScanBtn.innerHTML = `
      <span data-feather="loader" class="h-4 w-4 animate-spin"></span>
      Scanning...
    `;
  } else {
    customerScanBtn.disabled = false;
    customerScanBtn.classList.remove('opacity-80', 'cursor-not-allowed');
    customerScanBtn.innerHTML = `
      <span data-feather="play-circle"></span>
      Start scan
    `;
  }
  refreshIcons(customerScanBtn);
}

if (scansExportBtn) {
  scansExportBtn.addEventListener('click', async () => {
    if (!state.selectedCustomerId) {
      showToast({ title: 'No customer selected', message: 'Select a customer first.', variant: 'warning' });
      return;
    }
    await exportScans(state.selectedCustomerId);
  });
}

window.addEventListener('focus', () => {
  if (state.selectedCustomerId && !customerDetailViewEl.classList.contains('hidden')) {
    refreshCurrentWifiSsid()
      .then(() => {
        const customer = getCustomerById(state.selectedCustomerId);
        if (customer) {
          renderCustomerDetailPage(customer);
        }
      })
      .catch(() => {});
  }
});

window.addEventListener('DOMContentLoaded', () => {
  initAutoScanControls().catch((error) => {
    console.error('Failed to initialise auto scan controls', error);
  });
  loadCustomers().catch((error) => {
    showToast({
      title: 'Load failed',
      message: error.message || 'Could not load customers.',
      variant: 'danger'
    });
  });
});

window.addEventListener('beforeunload', () => {
  if (typeof autoScanStatusUnsubscribe === 'function') {
    autoScanStatusUnsubscribe();
    autoScanStatusUnsubscribe = null;
  }
  stopPowerStatePolling();
});

refreshIcons(document);




































