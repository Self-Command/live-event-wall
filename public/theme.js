'use strict';

(function initializeThemeModule() {
  const fontMap = {
    system: 'Inter, "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif',
    serif: '"Songti SC", "STSong", "Noto Serif CJK SC", Georgia, serif',
    rounded: '"Microsoft YaHei UI", "PingFang SC", "Arial Rounded MT Bold", system-ui, sans-serif',
    mono: '"JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace'
  };

  const renderers = new WeakMap();

  function hexToRgb(color) {
    const match = /^#([0-9a-f]{6})$/i.exec(color || '');
    if (!match) return { r: 110, g: 168, b: 255 };
    return {
      r: parseInt(match[1].slice(0, 2), 16),
      g: parseInt(match[1].slice(2, 4), 16),
      b: parseInt(match[1].slice(4, 6), 16)
    };
  }

  function makeStarRenderer(canvas) {
    const context = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    let stars = [];
    let accent = { r: 110, g: 168, b: 255 };
    let enabled = true;
    let animationId = 0;

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.max(40, Math.round((width * height) / 10000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 0.35 + Math.random() * 1.5,
        alpha: 0.18 + Math.random() * 0.72,
        speed: 0.0015 + Math.random() * 0.007,
        phase: Math.random() * Math.PI * 2
      }));
    }

    function frame(time) {
      context.clearRect(0, 0, width, height);
      if (enabled) {
        for (const star of stars) {
          const alpha = star.alpha * (0.7 + Math.sin(time * star.speed + star.phase) * 0.3);
          context.beginPath();
          context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
          context.fillStyle = `rgba(${accent.r},${accent.g},${accent.b},${Math.max(0.04, alpha)})`;
          context.fill();
        }
      }
      animationId = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener('resize', resize);
    animationId = requestAnimationFrame(frame);

    return {
      update(options) {
        enabled = Boolean(options.enabled);
        accent = hexToRgb(options.color);
        canvas.hidden = !enabled;
      },
      destroy() {
        cancelAnimationFrame(animationId);
        window.removeEventListener('resize', resize);
      }
    };
  }

  function getRenderer(canvas) {
    if (!canvas) return null;
    if (!renderers.has(canvas)) renderers.set(canvas, makeStarRenderer(canvas));
    return renderers.get(canvas);
  }

  function apply(settings) {
    if (!settings) return;
    const event = settings.event || {};
    const background = settings.background || {};
    const wall = settings.wall || {};
    const root = document.documentElement;
    const backgroundRoot = document.getElementById('theme-background');
    const imageLayer = backgroundRoot?.querySelector('.theme-image');
    const gradientLayer = backgroundRoot?.querySelector('.theme-gradient');
    const overlayLayer = backgroundRoot?.querySelector('.theme-overlay');
    const starsCanvas = backgroundRoot?.querySelector('.theme-stars');

    root.style.setProperty('--event-font', fontMap[event.fontFamily] || fontMap.system);
    root.style.setProperty('--title-color', event.titleColor || '#f7f9ff');
    root.style.setProperty('--subtitle-color', event.subtitleColor || '#b8cbf4');
    root.style.setProperty('--title-size', `${Number(event.titleSize || 52)}px`);
    root.style.setProperty('--subtitle-size', `${Number(event.subtitleSize || 21)}px`);
    root.style.setProperty('--signature-opacity', String(wall.signatureOpacity ?? 0.98));
    root.style.setProperty('--signature-gap', `${Number(wall.gap || 18)}px`);
    root.style.setProperty('--wall-padding', `${Number(wall.wallPadding || 20)}px`);
    root.style.setProperty('--glow-color', wall.glowColor || '#4f8cff');
    root.style.setProperty('--glow-strength', String(wall.signatureGlow === false ? 0 : (wall.glowStrength ?? 0.56)));
    root.style.setProperty('--cell-padding', `${Number(wall.cellPadding ?? 8)}px`);

    if (backgroundRoot) {
      backgroundRoot.dataset.mode = background.mode || 'cosmos';
      backgroundRoot.style.setProperty('--bg-1', background.color1 || '#03091e');
      backgroundRoot.style.setProperty('--bg-2', background.color2 || '#071a45');
      backgroundRoot.style.setProperty('--bg-3', background.color3 || '#123c83');
      backgroundRoot.style.setProperty('--bg-angle', `${Number(background.angle || 150)}deg`);
      backgroundRoot.style.setProperty('--bg-blur', `${Number(background.blur || 0)}px`);
    }

    if (gradientLayer) {
      if (background.mode === 'solid') {
        gradientLayer.style.background = background.color1 || '#03091e';
      } else {
        gradientLayer.style.background = `linear-gradient(${Number(background.angle || 150)}deg, ${background.color1 || '#03091e'} 0%, ${background.color2 || '#071a45'} 52%, ${background.color3 || '#123c83'} 100%)`;
      }
    }

    if (imageLayer) {
      imageLayer.style.backgroundImage = background.image ? `url("${background.image}")` : 'none';
      imageLayer.style.backgroundSize = background.fit || 'cover';
      imageLayer.style.backgroundPosition = background.position || 'center center';
      imageLayer.style.filter = `blur(${Number(background.blur || 0)}px)`;
      imageLayer.style.transform = Number(background.blur || 0) > 0 ? 'scale(1.04)' : 'scale(1)';
      imageLayer.hidden = background.mode !== 'image' || !background.image;
    }

    if (overlayLayer) {
      overlayLayer.style.background = background.overlayColor || '#020817';
      overlayLayer.style.opacity = String(Number(background.overlayOpacity || 0));
    }

    const renderer = getRenderer(starsCanvas);
    renderer?.update({
      enabled: Boolean(background.stars) && ['cosmos', 'gradient', 'image'].includes(background.mode),
      color: background.color3 || '#76a7ff'
    });

    for (const element of document.querySelectorAll('#signer-title, #wall-title')) {
      element.textContent = event.title || '';
    }
    for (const element of document.querySelectorAll('#signer-subtitle, #wall-subtitle')) {
      element.textContent = event.subtitle || '';
    }

    const signerHeading = document.getElementById('signer-heading');
    const wallBrand = document.getElementById('wall-brand');
    const wallHeader = document.getElementById('wall-header');
    if (signerHeading) {
      signerHeading.hidden = event.showTitle === false;
      signerHeading.dataset.align = event.titleAlignment || 'left';
    }
    if (wallBrand) {
      wallBrand.hidden = event.showTitle === false;
      wallBrand.dataset.align = event.titleAlignment || 'left';
    }
    if (wallHeader) {
      wallHeader.dataset.align = event.titleAlignment || 'left';
      wallHeader.hidden = event.showTitle === false && event.showStatus === false;
    }

    const status = document.getElementById('wall-status');
    if (status) status.hidden = event.showStatus === false;
    const footer = document.getElementById('wall-footer');
    if (footer) footer.hidden = event.showFooter === false;

    document.body.dataset.font = event.fontFamily || 'system';
    document.dispatchEvent(new CustomEvent('livewall:theme-applied', { detail: settings }));
  }

  window.LiveWallTheme = { apply };
})();
