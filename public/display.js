'use strict';

const socket = io({
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: Infinity
});

const wall = document.getElementById('signature-wall');
const grid = document.getElementById('signature-grid');
const emptyState = document.getElementById('wall-empty');
const countElement = document.getElementById('wall-count');
const statusElement = document.getElementById('wall-status');
const statusText = document.getElementById('wall-status-text');
const pageIndicator = document.getElementById('page-indicator');
const pageCurrent = document.getElementById('page-current');
const pageTotal = document.getElementById('page-total');

let entries = [];
let settings = null;
let currentPage = 0;
let pageTimer = null;
let resizeTimer = null;
let packery = null;
let layoutGeneration = 0;
const shuffleCache = new Map();

function setConnection(connected) {
  statusElement.classList.toggle('is-connected', connected);
  statusElement.classList.toggle('is-disconnected', !connected);
  statusElement.classList.remove('is-connecting');
  statusText.textContent = connected ? '已连接' : '正在重连';
}

function numericSetting(value, fallback, min = -Infinity, max = Infinity) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function configuredPageSize() {
  return Math.round(numericSetting(settings?.wall?.maxPerPage, 96, 1, 240));
}

function wallGeometry() {
  const width = Math.max(1, wall.clientWidth || window.innerWidth);
  const height = Math.max(1, wall.clientHeight || window.innerHeight);
  const padding = Math.round(numericSetting(settings?.wall?.wallPadding, 20, 0, 120));
  return {
    width,
    height,
    padding,
    usableWidth: Math.max(1, width - padding * 2),
    usableHeight: Math.max(1, height - padding * 2)
  };
}

function capacityFor(itemWidth, itemHeight, gap, geometry) {
  const columns = Math.max(1, Math.floor((geometry.usableWidth + gap) / (itemWidth + gap)));
  const rows = Math.max(1, Math.floor((geometry.usableHeight + gap) / (itemHeight + gap)));
  return { columns, rows, capacity: columns * rows };
}

/**
 * Packery owns all item placement. This function only selects one uniform
 * item size and a page capacity that fits inside the LED safe area.
 */
function layoutPlan() {
  const geometry = wallGeometry();
  const gap = Math.round(numericSetting(settings?.wall?.gap, 18, 4, 80));

  // The studio values are the fixed signature box size. Signature count never
  // changes this scale; when the wall is full, the existing page system takes
  // over instead of shrinking or overlapping items.
  const requestedWidth = Math.round(numericSetting(settings?.wall?.minCellWidth, 280, 80, 640));
  const requestedHeight = Math.round(numericSetting(settings?.wall?.minCellHeight, 120, 48, 360));
  const itemWidth = Math.min(geometry.usableWidth, requestedWidth);
  const itemHeight = Math.min(geometry.usableHeight, requestedHeight);
  const capacity = capacityFor(itemWidth, itemHeight, gap, geometry);

  const plan = {
    ...geometry,
    ...capacity,
    gap,
    itemWidth,
    itemHeight,
    scale: 1
  };

  plan.pageSize = Math.max(1, Math.min(configuredPageSize(), plan.capacity));
  plan.gridWidth = plan.columns * plan.itemWidth + Math.max(0, plan.columns - 1) * plan.gap;
  plan.gridHeight = plan.rows * plan.itemHeight + Math.max(0, plan.rows - 1) * plan.gap;
  plan.slotCount = plan.capacity;
  return plan;
}

function pageSize() {
  return layoutPlan().pageSize;
}

function pageCount() {
  return Math.max(1, Math.ceil(entries.length / pageSize()));
}

function orderedEntries() {
  return settings?.wall?.order === 'newest' ? [...entries].reverse() : [...entries];
}

function visibleEntries() {
  const size = pageSize();
  const start = currentPage * size;
  return orderedEntries().slice(start, start + size);
}

function makeSignatureNode(entry, freshId) {
  const node = document.createElement('article');
  node.className = `wall-signature${entry.id === freshId ? ' is-new' : ''}`;
  node.dataset.id = entry.id;

  const clip = document.createElement('div');
  clip.className = 'signature-clip';

  const image = document.createElement('img');
  image.src = entry.signature;
  image.alt = '手写签名';
  image.draggable = false;
  image.decoding = 'async';
  image.loading = 'eager';
  image.addEventListener('error', () => {
    node.classList.add('is-broken');
  }, { once: true });

  clip.appendChild(image);
  node.appendChild(clip);
  return node;
}

function makeSpacerNode(index) {
  const node = document.createElement('div');
  node.className = 'wall-signature wall-signature-spacer';
  node.dataset.spacer = String(index);
  node.setAttribute('aria-hidden', 'true');
  return node;
}

function shuffleKey(pageEntries, plan) {
  const ids = pageEntries.map(entry => entry.id).join('|');
  return [
    currentPage,
    plan.columns,
    plan.rows,
    plan.itemWidth,
    plan.itemHeight,
    ids
  ].join(':');
}

function shuffledDescriptors(pageEntries, plan) {
  const key = shuffleKey(pageEntries, plan);
  const cached = shuffleCache.get(key);
  if (cached) return cached;

  const descriptors = pageEntries.map(entry => ({ type: 'entry', entry }));
  for (let index = pageEntries.length; index < plan.slotCount; index += 1) {
    descriptors.push({ type: 'spacer', index });
  }

  const shuffled = window._?.shuffle ? window._.shuffle(descriptors) : descriptors;
  shuffleCache.set(key, shuffled);
  if (shuffleCache.size > 24) {
    const firstKey = shuffleCache.keys().next().value;
    shuffleCache.delete(firstKey);
  }
  return shuffled;
}

function destroyPackery() {
  if (!packery) return;
  packery.destroy();
  packery = null;
}

function initializePackery(plan) {
  destroyPackery();

  grid.style.width = `${plan.gridWidth}px`;
  grid.style.height = `${plan.gridHeight}px`;
  grid.style.setProperty('--signature-item-width', `${plan.itemWidth}px`);
  grid.style.setProperty('--signature-item-height', `${plan.itemHeight}px`);

  if (typeof window.Packery !== 'function') {
    throw new Error('Packery layout runtime is unavailable');
  }

  const generation = ++layoutGeneration;
  packery = new window.Packery(grid, {
    itemSelector: '.wall-signature',
    columnWidth: plan.itemWidth,
    rowHeight: plan.itemHeight,
    gutter: plan.gap,
    percentPosition: false,
    resizeContainer: false,
    initLayout: false,
    transitionDuration: '0.42s',
    stagger: 12
  });

  const performLayout = () => {
    if (!packery || generation !== layoutGeneration) return;
    packery.reloadItems();
    packery.layout();
  };

  performLayout();

  if (typeof window.imagesLoaded === 'function') {
    const loader = window.imagesLoaded(grid);
    loader.on('progress', performLayout);
    loader.on('always', performLayout);
  }
}

function updateSafeArea() {
  const header = document.getElementById('wall-header');
  const footer = document.getElementById('wall-footer');
  const headerVisible = header && !header.hidden && getComputedStyle(header).display !== 'none';
  const footerVisible = footer && !footer.hidden && getComputedStyle(footer).display !== 'none';
  const headerBottom = headerVisible ? header.getBoundingClientRect().bottom : 12;
  const footerTop = footerVisible ? footer.getBoundingClientRect().top : window.innerHeight - 12;
  const indicatorReserve = settings?.wall?.showPageIndicator ? 58 : 12;
  const top = Math.max(12, Math.ceil(headerBottom + 12));
  const bottom = Math.max(12, indicatorReserve, Math.ceil(window.innerHeight - footerTop + 12));
  document.documentElement.style.setProperty('--wall-top', `${top}px`);
  document.documentElement.style.setProperty('--wall-bottom', `${bottom}px`);
}

function updatePageIndicator() {
  const total = pageCount();
  const shouldShow = Boolean(settings?.wall?.showPageIndicator) && total > 1;
  pageIndicator.hidden = !shouldShow;
  pageCurrent.textContent = String(currentPage + 1);
  pageTotal.textContent = String(total);
}

function renderPage(freshId = null) {
  const total = pageCount();
  currentPage = Math.max(0, Math.min(currentPage, total - 1));
  const plan = layoutPlan();
  const pageEntries = visibleEntries();
  const fragment = document.createDocumentFragment();

  for (const descriptor of shuffledDescriptors(pageEntries, plan)) {
    fragment.appendChild(
      descriptor.type === 'entry'
        ? makeSignatureNode(descriptor.entry, freshId)
        : makeSpacerNode(descriptor.index)
    );
  }

  grid.replaceChildren(fragment);
  emptyState.classList.toggle('is-hidden', entries.length > 0);
  countElement.textContent = String(entries.length);
  updatePageIndicator();
  initializePackery(plan);
}

function restartPageTimer() {
  clearInterval(pageTimer);
  if (pageCount() <= 1) return;
  const seconds = Math.max(4, Number(settings?.wall?.pageInterval || 10));
  pageTimer = setInterval(() => {
    currentPage = (currentPage + 1) % pageCount();
    wall.classList.add('is-switching');
    setTimeout(() => {
      renderPage();
      wall.classList.remove('is-switching');
    }, 160);
  }, seconds * 1000);
}

function rerender() {
  updateSafeArea();
  requestAnimationFrame(() => {
    renderPage();
    restartPageTimer();
  });
}

function applySettings(nextSettings) {
  if (!nextSettings) return;
  settings = nextSettings;
  shuffleCache.clear();
  window.LiveWallTheme?.apply(settings);
  rerender();
}

function addSignature(entry) {
  if (!entry?.id || entries.some(item => item.id === entry.id)) return;
  entries.push(entry);
  shuffleCache.clear();
  currentPage = settings?.wall?.order === 'newest' ? 0 : pageCount() - 1;
  renderPage(entry.id);
  restartPageTimer();
}

function removeSignature(id) {
  entries = entries.filter(entry => entry.id !== id);
  shuffleCache.clear();
  currentPage = Math.min(currentPage, pageCount() - 1);
  renderPage();
  restartPageTimer();
}

socket.on('connect', () => setConnection(true));
socket.on('disconnect', () => setConnection(false));
socket.on('connect_error', () => setConnection(false));
socket.on('wall:init', data => {
  entries = Array.isArray(data?.entries) ? data.entries : [];
  settings = data?.settings || settings;
  shuffleCache.clear();
  if (settings) window.LiveWallTheme?.apply(settings);
  currentPage = settings?.wall?.order === 'newest' ? 0 : Math.max(0, pageCount() - 1);
  rerender();
});
socket.on('settings:update', applySettings);
socket.on('signature:new', addSignature);
socket.on('signature:removed', removeSignature);
socket.on('signature:count', count => {
  if (Number.isFinite(count)) countElement.textContent = String(count);
});
socket.on('wall:cleared', () => {
  entries = [];
  currentPage = 0;
  shuffleCache.clear();
  renderPage();
  restartPageTimer();
});

window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    shuffleCache.clear();
    rerender();
  }, 100);
});
document.addEventListener('livewall:theme-applied', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(rerender, 40);
});
document.addEventListener('keydown', event => {
  if (event.key.toLowerCase() !== 'f') return;
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
});

if (new URLSearchParams(location.search).has('preview')) {
  window.addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    if (event.data?.type !== 'livewall:preview-settings' || !event.data.settings) return;
    applySettings(event.data.settings);
  });
}
