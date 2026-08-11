'use strict';

const socket = io({ reconnection: true, reconnectionAttempts: Infinity });
const preview = document.getElementById('wall-preview');
const toast = document.getElementById('studio-toast');
const statusLabel = document.getElementById('studio-status');
const manager = document.getElementById('signature-manager');
const countLabel = document.getElementById('signature-count-label');
const tokenInput = document.getElementById('admin-token');

let settings = null;
let entries = [];
let toastTimer = null;
let previewTimer = null;

const fields = {
  title: document.getElementById('setting-title'),
  subtitle: document.getElementById('setting-subtitle'),
  titleAlignment: document.getElementById('setting-title-alignment'),
  fontFamily: document.getElementById('setting-font'),
  titleColor: document.getElementById('setting-title-color'),
  subtitleColor: document.getElementById('setting-subtitle-color'),
  titleSize: document.getElementById('setting-title-size'),
  subtitleSize: document.getElementById('setting-subtitle-size'),
  showTitle: document.getElementById('setting-show-title'),
  showStatus: document.getElementById('setting-show-status'),
  showFooter: document.getElementById('setting-show-footer'),
  bgMode: document.getElementById('setting-bg-mode'),
  color1: document.getElementById('setting-color-1'),
  color2: document.getElementById('setting-color-2'),
  color3: document.getElementById('setting-color-3'),
  angle: document.getElementById('setting-angle'),
  bgFit: document.getElementById('setting-bg-fit'),
  bgPosition: document.getElementById('setting-bg-position'),
  overlayColor: document.getElementById('setting-overlay-color'),
  overlayOpacity: document.getElementById('setting-overlay-opacity'),
  bgBlur: document.getElementById('setting-bg-blur'),
  stars: document.getElementById('setting-stars'),
  gap: document.getElementById('setting-gap'),
  wallPadding: document.getElementById('setting-wall-padding'),
  maxPerPage: document.getElementById('setting-max-page'),
  pageInterval: document.getElementById('setting-page-interval'),
  autoPageSize: document.getElementById('setting-auto-page-size'),
  minCellWidth: document.getElementById('setting-min-cell-width'),
  minCellHeight: document.getElementById('setting-min-cell-height'),
  cellPadding: document.getElementById('setting-cell-padding'),
  order: document.getElementById('setting-order'),
  signatureOpacity: document.getElementById('setting-signature-opacity'),
  glowColor: document.getElementById('setting-glow-color'),
  glowStrength: document.getElementById('setting-glow-strength'),
  signatureGlow: document.getElementById('setting-signature-glow'),
  showPageIndicator: document.getElementById('setting-page-indicator'),
  penType: document.getElementById('setting-pen-type'),
  lineStyle: document.getElementById('setting-line-style'),
  penColor: document.getElementById('setting-pen-color'),
  penWidth: document.getElementById('setting-pen-width'),
  penOpacity: document.getElementById('setting-pen-opacity'),
  canvasColor: document.getElementById('setting-canvas-color'),
  advancedTools: document.getElementById('setting-advanced-tools')
};

const outputs = {
  angle: document.getElementById('angle-output'),
  overlay: document.getElementById('overlay-output'),
  blur: document.getElementById('blur-output'),
  gap: document.getElementById('gap-output'),
  padding: document.getElementById('padding-output'),
  cellPadding: document.getElementById('cell-padding-output'),
  signatureOpacity: document.getElementById('signature-opacity-output'),
  glow: document.getElementById('glow-output')
};

const presets = {
  cosmos: { mode: 'cosmos', color1: '#03091e', color2: '#071a45', color3: '#123c83', angle: 150, overlayColor: '#020817', overlayOpacity: 0.22, stars: true },
  aurora: { mode: 'gradient', color1: '#041625', color2: '#0a4b56', color3: '#503a88', angle: 132, overlayColor: '#021015', overlayOpacity: 0.16, stars: true },
  midnight: { mode: 'gradient', color1: '#030712', color2: '#111827', color3: '#1f2937', angle: 160, overlayColor: '#000000', overlayOpacity: 0.14, stars: false },
  sunrise: { mode: 'gradient', color1: '#2b143f', color2: '#b33b5e', color3: '#f6a65a', angle: 135, overlayColor: '#1d1027', overlayOpacity: 0.12, stars: false },
  pearl: { mode: 'gradient', color1: '#f8fafc', color2: '#dbeafe', color3: '#c7d2fe', angle: 145, overlayColor: '#ffffff', overlayOpacity: 0.04, stars: false }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function headers() {
  const token = tokenInput.value.trim();
  return token ? { 'Content-Type': 'application/json', 'x-wall-admin-token': token } : { 'Content-Type': 'application/json' };
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.error || `请求失败：${response.status}`);
  return data;
}

function showToast(message, error = false) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('is-error', error);
  toast.classList.add('is-visible');
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function updateOutputs() {
  outputs.angle.value = `${fields.angle.value}°`;
  outputs.overlay.value = `${fields.overlayOpacity.value}%`;
  outputs.blur.value = `${fields.bgBlur.value}px`;
  outputs.gap.value = `${fields.gap.value}px`;
  outputs.padding.value = `${fields.wallPadding.value}px`;
  outputs.cellPadding.value = `${fields.cellPadding.value}px`;
  outputs.signatureOpacity.value = `${fields.signatureOpacity.value}%`;
  outputs.glow.value = `${fields.glowStrength.value}%`;
}

function fillForm(value) {
  settings = clone(value);
  const event = settings.event;
  const background = settings.background;
  const wall = settings.wall;
  const signer = settings.signer;

  fields.title.value = event.title;
  fields.subtitle.value = event.subtitle;
  fields.titleAlignment.value = event.titleAlignment;
  fields.fontFamily.value = event.fontFamily;
  fields.titleColor.value = event.titleColor.slice(0, 7);
  fields.subtitleColor.value = event.subtitleColor.slice(0, 7);
  fields.titleSize.value = event.titleSize;
  fields.subtitleSize.value = event.subtitleSize;
  fields.showTitle.checked = event.showTitle;
  fields.showStatus.checked = event.showStatus;
  fields.showFooter.checked = event.showFooter;

  fields.bgMode.value = background.mode;
  fields.color1.value = background.color1.slice(0, 7);
  fields.color2.value = background.color2.slice(0, 7);
  fields.color3.value = background.color3.slice(0, 7);
  fields.angle.value = background.angle;
  fields.bgFit.value = background.fit;
  fields.bgPosition.value = background.position;
  fields.overlayColor.value = background.overlayColor.slice(0, 7);
  fields.overlayOpacity.value = Math.round(background.overlayOpacity * 100);
  fields.bgBlur.value = background.blur;
  fields.stars.checked = background.stars;
  document.getElementById('background-name').textContent = background.image ? background.image.split('/').pop() : '未上传';

  fields.gap.value = wall.gap;
  fields.wallPadding.value = wall.wallPadding;
  fields.maxPerPage.value = wall.maxPerPage;
  fields.pageInterval.value = wall.pageInterval;
  fields.autoPageSize.checked = wall.autoPageSize !== false;
  fields.minCellWidth.value = wall.minCellWidth ?? 150;
  fields.minCellHeight.value = wall.minCellHeight ?? 82;
  fields.cellPadding.value = wall.cellPadding ?? 8;
  fields.order.value = wall.order || 'oldest';
  fields.signatureOpacity.value = Math.round(wall.signatureOpacity * 100);
  fields.glowColor.value = wall.glowColor.slice(0, 7);
  fields.glowStrength.value = Math.round(wall.glowStrength * 100);
  fields.signatureGlow.checked = wall.signatureGlow;
  fields.showPageIndicator.checked = wall.showPageIndicator;

  fields.penType.value = signer.defaultPenType;
  fields.lineStyle.value = signer.defaultLineStyle;
  fields.penColor.value = signer.defaultPenColor.slice(0, 7);
  fields.penWidth.value = signer.defaultPenWidth;
  fields.penOpacity.value = Math.round(signer.defaultOpacity * 100);
  fields.canvasColor.value = (signer.canvasColor || '#ffffff').slice(0, 7);
  fields.advancedTools.checked = signer.showAdvancedTools;

  document.querySelectorAll('.preset-card').forEach(button => button.classList.toggle('is-active', button.dataset.preset === background.preset));
  updateOutputs();
  sendPreview();
}

function collectSettings() {
  const next = clone(settings);
  next.event = {
    title: fields.title.value,
    subtitle: fields.subtitle.value,
    titleAlignment: fields.titleAlignment.value,
    fontFamily: fields.fontFamily.value,
    titleColor: fields.titleColor.value,
    subtitleColor: fields.subtitleColor.value,
    titleSize: Number(fields.titleSize.value),
    subtitleSize: Number(fields.subtitleSize.value),
    showTitle: fields.showTitle.checked,
    showStatus: fields.showStatus.checked,
    showFooter: fields.showFooter.checked
  };
  next.background = {
    ...next.background,
    mode: fields.bgMode.value,
    color1: fields.color1.value,
    color2: fields.color2.value,
    color3: fields.color3.value,
    angle: Number(fields.angle.value),
    fit: fields.bgFit.value,
    position: fields.bgPosition.value,
    overlayColor: fields.overlayColor.value,
    overlayOpacity: Number(fields.overlayOpacity.value) / 100,
    blur: Number(fields.bgBlur.value),
    stars: fields.stars.checked
  };
  next.wall = {
    gap: Number(fields.gap.value),
    wallPadding: Number(fields.wallPadding.value),
    maxPerPage: Number(fields.maxPerPage.value),
    pageInterval: Number(fields.pageInterval.value),
    autoPageSize: fields.autoPageSize.checked,
    minCellWidth: Number(fields.minCellWidth.value),
    minCellHeight: Number(fields.minCellHeight.value),
    cellPadding: Number(fields.cellPadding.value),
    order: fields.order.value,
    signatureOpacity: Number(fields.signatureOpacity.value) / 100,
    glowColor: fields.glowColor.value,
    glowStrength: Number(fields.glowStrength.value) / 100,
    signatureGlow: fields.signatureGlow.checked,
    showPageIndicator: fields.showPageIndicator.checked
  };
  next.signer = {
    ...next.signer,
    defaultPenType: fields.penType.value,
    defaultLineStyle: fields.lineStyle.value,
    defaultPenColor: fields.penColor.value,
    defaultPenWidth: Number(fields.penWidth.value),
    defaultOpacity: Number(fields.penOpacity.value) / 100,
    showAdvancedTools: fields.advancedTools.checked,
    canvasColor: fields.canvasColor.value
  };
  return next;
}

function sendPreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const draft = collectSettings();
    preview.contentWindow?.postMessage({ type: 'livewall:preview-settings', settings: draft }, location.origin);
  }, 70);
}

function renderEntries() {
  countLabel.textContent = `${entries.length} 份`;
  manager.replaceChildren();
  const recent = entries.slice(-30).reverse();
  if (!recent.length) {
    const empty = document.createElement('p');
    empty.className = 'manager-empty';
    empty.textContent = '暂无签名';
    manager.appendChild(empty);
    return;
  }

  for (const entry of recent) {
    const card = document.createElement('article');
    card.className = 'signature-manager-card';
    const image = document.createElement('img');
    image.src = entry.signature;
    image.alt = '签名缩略图';
    const meta = document.createElement('div');
    const time = document.createElement('small');
    time.textContent = new Date(entry.timestamp).toLocaleString();
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '删除';
    remove.addEventListener('click', async () => {
      if (!confirm('确认删除这份签名？')) return;
      try {
        await api(`/api/entries/${encodeURIComponent(entry.id)}`, { method: 'DELETE', headers: headers() });
        showToast('签名已删除');
      } catch (error) {
        showToast(error.message, true);
      }
    });
    meta.append(time, remove);
    card.append(image, meta);
    manager.appendChild(card);
  }
}

async function saveSettings() {
  try {
    const data = await api('/api/settings', {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ settings: collectSettings() })
    });
    fillForm(data.settings);
    showToast('设计已保存并实时应用');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function uploadBackground(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    showToast('背景图片不能超过 10MB', true);
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = await api('/api/background', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ image: reader.result })
      });
      fillForm(data.settings);
      showToast('背景图片已上传并应用');
    } catch (error) {
      showToast(error.message, true);
    }
  };
  reader.readAsDataURL(file);
}

function applyPreset(name) {
  const preset = presets[name];
  if (!preset) return;
  const draft = collectSettings();
  draft.background = { ...draft.background, ...preset, preset: name, image: '' };
  fillForm(draft);
}

for (const element of Object.values(fields)) {
  element.addEventListener('input', () => {
    settings = collectSettings();
    settings.background.preset = 'custom';
    updateOutputs();
    sendPreview();
  });
  element.addEventListener('change', sendPreview);
}

for (const button of document.querySelectorAll('.preset-card')) {
  button.addEventListener('click', () => applyPreset(button.dataset.preset));
}

document.getElementById('save-settings').addEventListener('click', saveSettings);
document.getElementById('background-file').addEventListener('change', event => uploadBackground(event.target.files?.[0]));
document.getElementById('remove-background').addEventListener('click', async () => {
  try {
    const data = await api('/api/background', { method: 'DELETE', headers: headers() });
    fillForm(data.settings);
    showToast('背景图片已移除');
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById('reset-settings').addEventListener('click', async () => {
  if (!confirm('确认恢复全部默认设计？')) return;
  try {
    const data = await api('/api/settings/reset', { method: 'POST', headers: headers() });
    fillForm(data.settings);
    showToast('已恢复默认设计');
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById('clear-signatures').addEventListener('click', async () => {
  if (!confirm(`确认清空全部 ${entries.length} 份签名？此操作不可撤销。`)) return;
  try {
    await api('/api/entries', { method: 'DELETE', headers: headers() });
    showToast('全部签名已清空');
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById('export-settings').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(collectSettings(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `signature-wall-settings-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
});

document.getElementById('import-settings').addEventListener('change', event => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      fillForm(imported);
      showToast('配置已载入，点击保存后正式应用');
    } catch (_error) {
      showToast('配置文件格式错误', true);
    }
  };
  reader.readAsText(file);
});

tokenInput.value = sessionStorage.getItem('livewall-admin-token') || '';
tokenInput.addEventListener('input', () => sessionStorage.setItem('livewall-admin-token', tokenInput.value));
preview.addEventListener('load', sendPreview);

socket.on('connect', () => { statusLabel.textContent = '实时连接正常'; });
socket.on('disconnect', () => { statusLabel.textContent = '正在重连'; });
socket.on('wall:init', data => {
  if (data?.settings) fillForm(data.settings);
  entries = Array.isArray(data?.entries) ? data.entries : [];
  renderEntries();
});
socket.on('settings:update', next => fillForm(next));
socket.on('signature:new', entry => {
  if (!entries.some(item => item.id === entry.id)) entries.push(entry);
  renderEntries();
});
socket.on('signature:removed', id => {
  entries = entries.filter(entry => entry.id !== id);
  renderEntries();
});
socket.on('wall:cleared', () => {
  entries = [];
  renderEntries();
});

Promise.all([
  api('/api/settings'),
  api('/api/entries')
]).then(([settingsData, entriesData]) => {
  fillForm(settingsData.settings);
  entries = entriesData.entries || [];
  renderEntries();
}).catch(error => showToast(error.message, true));
