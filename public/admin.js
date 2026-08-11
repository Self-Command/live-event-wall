'use strict';

const socket = io({
  reconnection: true,
  reconnectionDelay: 800,
  reconnectionAttempts: Infinity
});

const canvas = document.getElementById('signature-canvas');
const context = canvas.getContext('2d', { willReadFrequently: true });
const canvasFrame = document.getElementById('canvas-frame');
const placeholder = document.getElementById('canvas-placeholder');
const advancedTools = document.getElementById('advanced-tools');
const clearButton = document.getElementById('clear-button');
const undoButton = document.getElementById('undo-button');
const redoButton = document.getElementById('redo-button');
const eraserButton = document.getElementById('eraser-button');
const submitButton = document.getElementById('submit-button');
const submitLabel = document.getElementById('submit-label');
const connectionPill = document.getElementById('connection-pill');
const connectionText = document.getElementById('connection-text');
const toast = document.getElementById('success-toast');
const widthInput = document.getElementById('pen-width');
const widthOutput = document.getElementById('width-output');
const opacityInput = document.getElementById('pen-opacity');
const opacityOutput = document.getElementById('opacity-output');
const customColor = document.getElementById('custom-color');

const state = {
  strokes: [],
  redo: [],
  activeStroke: null,
  drawing: false,
  submitting: false,
  penType: 'round',
  lineStyle: 'solid',
  color: '#111827',
  width: 6,
  opacity: 1,
  erasing: false,
  defaultsApplied: false,
  canvasColor: '#ffffff'
};

let redrawQueued = false;
let toastTimer = null;

function requestRedraw() {
  if (redrawQueued) return;
  redrawQueued = true;
  requestAnimationFrame(() => {
    redrawQueued = false;
    redrawCanvas();
  });
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  redrawCanvas();
}

function eventPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(1, rect.height))),
    pressure: event.pressure && event.pressure > 0 ? event.pressure : 0.5
  };
}

function dashPattern(style, width) {
  if (style === 'dashed') return [width * 3.2, width * 1.9];
  if (style === 'dotted') return [0.01, width * 2.25];
  if (style === 'dashdot') return [width * 3.2, width * 1.55, 0.01, width * 1.55];
  return [];
}

function configureStroke(stroke) {
  context.globalCompositeOperation = stroke.erasing ? 'destination-out' : 'source-over';
  context.strokeStyle = stroke.erasing ? 'rgba(0,0,0,1)' : stroke.color;
  context.fillStyle = stroke.erasing ? 'rgba(0,0,0,1)' : stroke.color;
  context.globalAlpha = stroke.erasing ? 1 : stroke.opacity;
  context.lineJoin = 'round';
  context.lineCap = stroke.lineStyle === 'dotted' ? 'round' : (stroke.penType === 'fountain' ? 'butt' : 'round');
  context.shadowBlur = stroke.penType === 'neon' && !stroke.erasing ? stroke.width * 2.2 : 0;
  context.shadowColor = stroke.penType === 'neon' && !stroke.erasing ? stroke.color : 'transparent';
  context.setLineDash(dashPattern(stroke.lineStyle, stroke.width));
}

function drawDot(stroke, point, width, height) {
  const radius = Math.max(0.8, stroke.width * (0.72 + point.pressure * 0.38) / 2);
  context.beginPath();
  context.arc(point.x * width, point.y * height, radius, 0, Math.PI * 2);
  context.fill();
}

function drawStroke(stroke, width, height) {
  const points = stroke.points || [];
  if (!points.length) return;
  context.save();
  configureStroke(stroke);

  if (points.length === 1) {
    drawDot(stroke, points[0], width, height);
    context.restore();
    return;
  }

  if (stroke.lineStyle !== 'solid') {
    context.lineWidth = stroke.width * (stroke.penType === 'marker' ? 1.7 : 1);
    context.beginPath();
    context.moveTo(points[0].x * width, points[0].y * height);
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const midX = ((previous.x + current.x) / 2) * width;
      const midY = ((previous.y + current.y) / 2) * height;
      context.quadraticCurveTo(previous.x * width, previous.y * height, midX, midY);
    }
    const last = points[points.length - 1];
    context.lineTo(last.x * width, last.y * height);
    context.stroke();
    context.restore();
    return;
  }

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const dx = (current.x - previous.x) * width;
    const dy = (current.y - previous.y) * height;
    const angle = Math.atan2(dy, dx);
    const pressure = (previous.pressure + current.pressure) / 2;
    let lineWidth = stroke.width * (0.78 + pressure * 0.45);
    if (stroke.penType === 'fountain') lineWidth *= 0.62 + Math.abs(Math.sin(angle - Math.PI / 4)) * 0.88;
    if (stroke.penType === 'marker') lineWidth *= 1.75;
    if (stroke.erasing) lineWidth *= 1.8;

    context.lineWidth = lineWidth;
    context.globalAlpha = stroke.erasing ? 1 : stroke.opacity * (stroke.penType === 'marker' ? 0.52 : 1);
    context.beginPath();
    context.moveTo(previous.x * width, previous.y * height);
    context.lineTo(current.x * width, current.y * height);
    context.stroke();
  }
  context.restore();
}

function redrawCanvas() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.restore();
  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  for (const stroke of state.strokes) drawStroke(stroke, rect.width, rect.height);
  if (state.activeStroke) drawStroke(state.activeStroke, rect.width, rect.height);
  updateControls();
}

function makeStroke(point) {
  return {
    points: [point],
    penType: state.penType,
    lineStyle: state.erasing ? 'solid' : state.lineStyle,
    color: state.color,
    width: state.width,
    opacity: state.opacity,
    erasing: state.erasing
  };
}

function startDrawing(event) {
  if (state.submitting) return;
  event.preventDefault();
  canvas.setPointerCapture?.(event.pointerId);
  state.drawing = true;
  state.activeStroke = makeStroke(eventPoint(event));
  requestRedraw();
}

function continueDrawing(event) {
  if (!state.drawing || !state.activeStroke || state.submitting) return;
  event.preventDefault();
  const point = eventPoint(event);
  const previous = state.activeStroke.points[state.activeStroke.points.length - 1];
  const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
  if (distance < 0.0012) return;
  state.activeStroke.points.push(point);
  requestRedraw();
}

function stopDrawing(event) {
  if (!state.drawing || !state.activeStroke) return;
  state.drawing = false;
  state.strokes.push(state.activeStroke);
  state.activeStroke = null;
  state.redo = [];
  if (event?.pointerId != null) canvas.releasePointerCapture?.(event.pointerId);
  requestRedraw();
}

function undo() {
  if (!state.strokes.length || state.submitting) return;
  state.redo.push(state.strokes.pop());
  requestRedraw();
}

function redo() {
  if (!state.redo.length || state.submitting) return;
  state.strokes.push(state.redo.pop());
  requestRedraw();
}

function clearSignature() {
  if (state.submitting) return;
  state.strokes = [];
  state.redo = [];
  state.activeStroke = null;
  state.drawing = false;
  requestRedraw();
}

function hasVisibleInk() {
  return state.strokes.some(stroke => !stroke.erasing && stroke.points.length > 0);
}

function croppedSignatureDataUrl() {
  redrawCanvas();
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = pixels;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) throw new Error('请先完成签名');
  const padding = Math.round(26 * Math.min(window.devicePixelRatio || 1, 2));
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding);
  maxY = Math.min(height - 1, maxY + padding);

  const cropped = document.createElement('canvas');
  cropped.width = maxX - minX + 1;
  cropped.height = maxY - minY + 1;
  cropped.getContext('2d').drawImage(canvas, minX, minY, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
  return cropped.toDataURL('image/png');
}

function setSubmitting(value) {
  state.submitting = value;
  submitButton.classList.toggle('is-loading', value);
  submitLabel.textContent = value ? '正在发送到大屏' : '确认签名并上墙';
  updateControls();
}

function showSuccess() {
  clearTimeout(toastTimer);
  toast.classList.add('is-visible');
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2300);
}

function submitSignature() {
  if (!hasVisibleInk() || state.submitting || !socket.connected) return;
  let signature;
  try {
    signature = croppedSignatureDataUrl();
  } catch (_error) {
    return;
  }

  setSubmitting(true);
  socket.timeout(12000).emit('signature:submit', {
    signature,
    style: {
      penType: state.penType,
      lineStyle: state.lineStyle,
      color: state.color,
      width: state.width,
      opacity: state.opacity
    }
  }, (timeoutError, response) => {
    setSubmitting(false);
    if (timeoutError || !response?.success) {
      setConnection(false, response?.error || '提交失败，请重试');
      return;
    }
    clearSignature();
    showSuccess();
  });
}

function setConnection(connected, message) {
  connectionPill.classList.toggle('is-connected', connected);
  connectionPill.classList.toggle('is-disconnected', !connected);
  connectionPill.classList.remove('is-connecting');
  connectionText.textContent = message || (connected ? '已连接' : '连接中断');
  updateControls();
}

function updateControls() {
  const hasInk = hasVisibleInk();
  placeholder.classList.toggle('is-hidden', hasInk || Boolean(state.activeStroke));
  undoButton.disabled = state.submitting || !state.strokes.length;
  redoButton.disabled = state.submitting || !state.redo.length;
  clearButton.disabled = state.submitting || (!state.strokes.length && !state.activeStroke);
  submitButton.disabled = state.submitting || !hasInk || !socket.connected;
  eraserButton.classList.toggle('is-active', state.erasing);
}

function selectButtons(selector, dataName, value) {
  document.querySelectorAll(selector).forEach(button => {
    button.classList.toggle('is-active', button.dataset[dataName] === value);
  });
}

function setColor(color) {
  state.color = color;
  state.erasing = false;
  customColor.value = /^#[0-9a-f]{6}$/i.test(color) ? color : '#111827';
  document.querySelectorAll('.color-choice').forEach(button => {
    button.classList.toggle('is-active', button.dataset.color.toLowerCase() === color.toLowerCase());
  });
  updateCanvasPreview();
  updateControls();
}

function colorLuminance(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return 0;
  const values = [0, 2, 4].map(index => parseInt(match[1].slice(index, index + 2), 16) / 255);
  const normalized = values.map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return normalized[0] * 0.2126 + normalized[1] * 0.7152 + normalized[2] * 0.0722;
}

function updateCanvasPreview() {
  const needsDarkPreview = colorLuminance(state.color) > 0.76 && !state.erasing;
  canvasFrame.classList.toggle('dark-preview', needsDarkPreview);
  canvasFrame.style.setProperty('--canvas-color', needsDarkPreview ? '#17213b' : state.canvasColor);
}

function applySettings(settings) {
  window.LiveWallTheme?.apply(settings);
  const signer = settings?.signer || {};
  state.canvasColor = signer.canvasColor || '#ffffff';
  advancedTools.hidden = signer.showAdvancedTools === false;

  if (!state.defaultsApplied) {
    state.defaultsApplied = true;
    state.penType = signer.defaultPenType || 'round';
    state.lineStyle = signer.defaultLineStyle || 'solid';
    state.color = signer.defaultPenColor || '#111827';
    state.width = Number(signer.defaultPenWidth || 6);
    state.opacity = Number(signer.defaultOpacity ?? 1);
    widthInput.value = String(state.width);
    opacityInput.value = String(Math.round(state.opacity * 100));
    widthOutput.value = String(state.width);
    opacityOutput.value = `${Math.round(state.opacity * 100)}%`;
    selectButtons('.pen-type', 'penType', state.penType);
    selectButtons('.line-style', 'lineStyle', state.lineStyle);
    setColor(state.color);
  }
  updateCanvasPreview();
}

canvas.addEventListener('pointerdown', startDrawing);
canvas.addEventListener('pointermove', continueDrawing);
canvas.addEventListener('pointerup', stopDrawing);
canvas.addEventListener('pointercancel', stopDrawing);
canvas.addEventListener('pointerleave', event => {
  if (event.buttons === 0) stopDrawing(event);
});

undoButton.addEventListener('click', undo);
redoButton.addEventListener('click', redo);
clearButton.addEventListener('click', clearSignature);
submitButton.addEventListener('click', submitSignature);
eraserButton.addEventListener('click', () => {
  state.erasing = !state.erasing;
  updateCanvasPreview();
  updateControls();
});

for (const button of document.querySelectorAll('.pen-type')) {
  button.addEventListener('click', () => {
    state.penType = button.dataset.penType;
    state.erasing = false;
    selectButtons('.pen-type', 'penType', state.penType);
    updateControls();
  });
}

for (const button of document.querySelectorAll('.line-style')) {
  button.addEventListener('click', () => {
    state.lineStyle = button.dataset.lineStyle;
    state.erasing = false;
    selectButtons('.line-style', 'lineStyle', state.lineStyle);
    updateControls();
  });
}

for (const button of document.querySelectorAll('.color-choice')) {
  button.addEventListener('click', () => setColor(button.dataset.color));
}

customColor.addEventListener('input', () => setColor(customColor.value));
widthInput.addEventListener('input', () => {
  state.width = Number(widthInput.value);
  widthOutput.value = String(state.width);
  state.erasing = false;
  updateControls();
});
opacityInput.addEventListener('input', () => {
  state.opacity = Number(opacityInput.value) / 100;
  opacityOutput.value = `${opacityInput.value}%`;
  state.erasing = false;
  updateControls();
});

socket.on('connect', () => setConnection(true));
socket.on('disconnect', () => setConnection(false, '正在重连'));
socket.on('connect_error', () => setConnection(false, '连接失败'));
socket.on('wall:init', data => applySettings(data?.settings));
socket.on('settings:update', applySettings);

window.addEventListener('resize', resizeCanvas);
window.addEventListener('load', resizeCanvas);
