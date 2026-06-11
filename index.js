// Mobile Optimizer Pro v2.1 - Complete Extension
// Features: Auto-detect, Per-Chat, Theme Support, Export/Import, Lazy Load Profile
// Floating Button, Prevent Keyboard Shift, Auto-show Keyboard Control

(function () {
  'use strict';

  const EXT_ID = 'mobile_optimizer_pro';
  const STORAGE_KEY = 'ext_settings.mobile_optimizer_pro';
  const CHAT_OVERRIDES_KEY = 'ext_settings.mobile_optimizer_pro_chat_overrides';
  const EXT_DISPLAY = 'Mobile Optimizer Pro';

  // Default Settings
  const DEFAULTS = {
    enabled: true,
    autoDetect: true,
    virtualize: true,
    threshold: 12,
    lockViewport: true,
    preventKeyboardShift: false,
    autoShowKeyboard: false,
    stripAnimations: true,
    hideAvatars: false,
    lazyLoad: true,
    lazyProfile: true,
    aggressiveCss: true,
    themeDetect: true,
    perChat: false,
    debug: false,
    optimizedExtensions: []
  };

  let settings = { ...DEFAULTS };
  let chatOverrides = {};
  let archivedNodes = new Map();
  let extensionList = [];
  let statsInterval = null;
  let currentChatId = null;
  let devicePerformance = 'medium';
  let originalFocusMethods = {};

  // ─── Settings Management ─────────────────────────────────────────────────────
  function loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      settings = { ...DEFAULTS, ...(saved ? JSON.parse(saved) : {}) };
      const savedOverrides = localStorage.getItem(CHAT_OVERRIDES_KEY);
      chatOverrides = savedOverrides ? JSON.parse(savedOverrides) : {};
    } catch (e) {
      console.error(`[${EXT_DISPLAY}] Failed to load settings:`, e);
      settings = { ...DEFAULTS };
      chatOverrides = {};
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      localStorage.setItem(CHAT_OVERRIDES_KEY, JSON.stringify(chatOverrides));
    } catch (e) {
      console.error(`[${EXT_DISPLAY}] Failed to save settings:`, e);
    }
  }

  // ─── Device Performance Detection ────────────────────────────────────────────
  function detectDevicePerformance() {
    if (!settings.autoDetect) return;

    const startTime = performance.now();
    const testDiv = document.createElement('div');
    testDiv.style.display = 'none';
    document.body.appendChild(testDiv);
    for (let i = 0; i < 100; i++) {
      const child = document.createElement('div');
      child.textContent = 'test';
      testDiv.appendChild(child);
    }
    testDiv.innerHTML = '';
    document.body.removeChild(testDiv);
    const endTime = performance.now();
    const duration = endTime - startTime;

    if (duration < 10) {
      devicePerformance = 'high';
      settings.threshold = Math.max(settings.threshold, 20);
    } else if (duration < 30) {
      devicePerformance = 'medium';
      settings.threshold = Math.max(settings.threshold, 12);
    } else {
      devicePerformance = 'low';
      settings.threshold = Math.max(settings.threshold, 8);
    }

    if (settings.debug) {
      console.log(`[${EXT_DISPLAY}] Device performance: ${devicePerformance} (${duration.toFixed(2)}ms)`);
    }

    updatePerformanceDisplay();
  }

  function updatePerformanceDisplay() {
    const perfEl = document.getElementById('mop-device-perf');
    if (perfEl) {
      perfEl.textContent = devicePerformance.charAt(0).toUpperCase() + devicePerformance.slice(1);
      perfEl.style.color = devicePerformance === 'high' ? '#4ade80' :
                           devicePerformance === 'medium' ? '#fbbf24' : '#ef4444';
    }
  }

  // ─── Theme Detection ─────────────────────────────────────────────────────────
  function detectCurrentTheme() {
    if (!settings.themeDetect) return;

    const themeEl = document.getElementById('mop-current-theme');
    if (!themeEl) return;

    const bodyClasses = document.body.className;
    const htmlClasses = document.documentElement.className;
    let themeName = 'Default';

    if (bodyClasses.includes('dark') || htmlClasses.includes('dark')) {
      themeName = 'Dark Theme';
    } else if (bodyClasses.includes('light') || htmlClasses.includes('light')) {
      themeName = 'Light Theme';
    } else if (bodyClasses.includes('amoled') || htmlClasses.includes('amoled')) {
      themeName = 'AMOLED Theme';
    }

    const themeLinks = document.querySelectorAll('link[rel="stylesheet"]');
    themeLinks.forEach(link => {
      if (link.href.includes('theme')) {
        const match = link.href.match(/theme[_-]?([a-z0-9]+)/i);
        if (match) {
          themeName = match[1].charAt(0).toUpperCase() + match[1].slice(1) + ' Theme';
        }
      }
    });

    themeEl.textContent = themeName;

    if (settings.debug) {
      console.log(`[${EXT_DISPLAY}] Detected theme: ${themeName}`);
    }
  }

  // ─── Per-Chat Settings ───────────────────────────────────────────────────────
  function getCurrentChatId() {
    if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
      const ctx = SillyTavern.getContext();
      return ctx.chatId || null;
    }
    const chatElement = document.querySelector('[data-chat-id]');
    if (chatElement) {
      return chatElement.dataset.chatId;
    }
    return null;
  }

  function applyChatOverride() {
    if (!settings.perChat || !currentChatId) return;

    const override = chatOverrides[currentChatId];
    if (override) {
      settings.threshold = override.threshold || DEFAULTS.threshold;
      settings.virtualize = override.virtualize !== undefined ? override.virtualize : DEFAULTS.virtualize;

      if (settings.debug) {
        console.log(`[${EXT_DISPLAY}] Applied chat override for ${currentChatId}:`, override);
      }
    }
  }

  function saveChatOverride() {
    if (!currentChatId) return;

    chatOverrides[currentChatId] = {
      threshold: settings.threshold,
      virtualize: settings.virtualize,
      hideAvatars: settings.hideAvatars
    };

    saveSettings();

    if (typeof toastr !== 'undefined') {
      toastr.success('Chat override saved!', EXT_DISPLAY);
    }
  }

  // ─── Extension Detection ─────────────────────────────────────────────────────
  function detectExtensions() {
    extensionList = [];

    if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
      const ctx = SillyTavern.getContext();
      if (ctx.extensionSettings) {
        Object.keys(ctx.extensionSettings).forEach(extName => {
          if (extName !== EXT_ID) {
            extensionList.push({
              name: extName,
              displayName: extName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              enabled: true
            });
          }
        });
      }
    }

    const extContainers = document.querySelectorAll('[id*="extension"], [class*="extension"]');
    extContainers.forEach(container => {
      const id = container.id || '';
      const className = container.className || '';
      const match = id.match(/ext[_-]?([a-z0-9_]+)/i) || className.match(/ext[_-]?([a-z0-9_]+)/i);
      if (match && match[1]) {
        const extName = match[1].toLowerCase();
        if (!extensionList.find(e => e.name === extName)) {
          extensionList.push({
            name: extName,
            displayName: extName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            enabled: true
          });
        }
      }
    });

    extensionList.sort((a, b) => a.name.localeCompare(b.name));

    if (settings.debug) {
      console.log(`[${EXT_DISPLAY}] Detected extensions:`, extensionList);
    }

    return extensionList;
  }

  // ─── CSS Injection ───────────────────────────────────────────────────────────
  function injectCSS() {
    let styleEl = document.getElementById('mop-optimized-css');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'mop-optimized-css';
      document.head.appendChild(styleEl);
    }

    let css = `
      /* Core Performance */
      #chat {
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
        contain: strict;
        transform: translate3d(0,0,0);
      }

      /* Viewport Lock */
      body.mop-viewport-locked #chat {
        height: 100dvh !important;
        position: fixed !important;
        inset: 0 !important;
      }

      /* Prevent Keyboard Shift Mode */
      body.mop-prevent-shift {
        position: fixed !important;
        width: 100% !important;
      }

      body.mop-prevent-shift #send_form {
        position: relative !important;
        bottom: auto !important;
      }

      body.mop-prevent-shift #chat {
        margin-bottom: auto !important;
        padding-bottom: 20px !important;
      }

      /* Lazy Load Profile Images */
      .mop-lazy-profile img {
        opacity: 0;
        transition: opacity 0.3s;
      }

      .mop-lazy-profile img.loaded {
        opacity: 1;
      }

      /* Keyboard Fix */
      .mop-viewport-locked {
        position: fixed !important;
        width: 100% !important;
        height: 100vh !important;
        overflow: hidden !important;
        top: 0 !important;
        left: 0 !important;
      }

      .mop-keyboard-fix #send_form,
      .mop-keyboard-fix #chat {
        position: relative !important;
      }

      body.mop-viewport-locked::after {
        content: '';
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: 100vh;
        background: transparent;
        pointer-events: none;
        z-index: -1;
      }

      body.mop-viewport-locked #send_form {
        position: fixed !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        z-index: 1000 !important;
        background: inherit !important;
      }

      body.mop-viewport-locked #chat {
        margin-bottom: 0 !important;
        padding-bottom: 80px !important;
      }

      @supports (-webkit-touch-callout: none) {
        .mop-viewport-locked {
          height: -webkit-fill-available !important;
        }
      }

      /* Prevent Auto-focus */
      .mop-no-auto-focus #send_textarea:focus,
      .mop-no-auto-focus #send_form input:focus {
        outline: none;
      }
    `;

    if (settings.aggressiveCss && settings.optimizedExtensions.length > 0) {
      const extSelectors = settings.optimizedExtensions.map(ext => {
        return `[id*="${ext}"], [class*="${ext}"]`;
      }).join(', ');

      if (extSelectors) {
        css += `
          ${extSelectors} {
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            filter: none !important;
            box-shadow: 0 1px 2px rgba(0,0,0,0.1) !important;
            background-attachment: scroll !important;
          }
        `;
      }
    }

    if (settings.stripAnimations) {
      css += `
        .mop-no-anim * {
          animation: none !important;
          transition: none !important;
        }
      `;
    }

    if (settings.hideAvatars) {
      css += `
        .mop-hide-avatars .avatar,
        .mop-hide-avatars .mes_avatar {
          display: none !important;
        }
      `;
    }

    css += `
      .mes.mop-archived {
        height: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        overflow: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        contain: strict !important;
      }
    `;

    styleEl.textContent = css;
  }

  // ─── Prevent Auto-focus ──────────────────────────────────────────────────────
  function preventAutoFocus() {
    if (settings.autoShowKeyboard) {
      if (originalFocusMethods.restore) {
        originalFocusMethods.restore();
      }
      document.body.classList.remove('mop-no-auto-focus');
      return;
    }

    document.body.classList.add('mop-no-auto-focus');

    if (!originalFocusMethods.stored) {
      const textarea = document.getElementById('send_textarea');
      const input = document.querySelector('#send_form input');

      if (textarea) {
        originalFocusMethods.textarea = textarea.focus;
        textarea.focus = function() {
          if (settings.debug) {
            console.log('[MOP] Blocked auto-focus on textarea');
          }
        };
      }

      if (input) {
        originalFocusMethods.input = input.focus;
        input.focus = function() {
          if (settings.debug) {
            console.log('[MOP] Blocked auto-focus on input');
          }
        };
      }

      originalFocusMethods.stored = true;
    }

    document.addEventListener('focus', function(e) {
      if (!settings.autoShowKeyboard) {
        const target = e.target;
        if (target.id === 'send_textarea' ||
            (target.tagName === 'INPUT' && target.closest('#send_form'))) {
          if (!e.isTrusted) {
            e.preventDefault();
            e.stopPropagation();
            if (settings.debug) {
              console.log('[MOP] Blocked programmatic focus');
            }
          }
        }
      }
    }, true);
  }

  // ─── Viewport Lock ───────────────────────────────────────────────────────────
  function setupViewportLock() {
    const visualViewport = window.visualViewport;

    document.body.classList.remove('mop-viewport-locked', 'mop-prevent-shift');
    document.body.style.height = '';
    document.body.style.overflow = '';

    if (!settings.lockViewport) {
      if (window.mopViewportHandler && visualViewport) {
        visualViewport.removeEventListener('resize', window.mopViewportHandler);
        visualViewport.removeEventListener('scroll', window.mopViewportHandler);
      }
      return;
    }

    if (settings.preventKeyboardShift) {
      document.body.classList.add('mop-prevent-shift');
      return;
    }

    if (!visualViewport) {
      document.body.classList.add('mop-keyboard-fix');
      return;
    }

    let keyboardOpen = false;

    const handleResize = () => {
      const viewportHeight = visualViewport.height;
      const windowHeight = window.innerHeight;
      const isKeyboardOpen = viewportHeight < windowHeight * 0.75;

      if (isKeyboardOpen !== keyboardOpen) {
        keyboardOpen = isKeyboardOpen;

        if (keyboardOpen) {
          document.body.classList.add('mop-viewport-locked');
          document.body.style.height = `${viewportHeight}px`;
          document.body.style.overflow = 'hidden';

          setTimeout(() => {
            const chat = document.getElementById('chat');
            if (chat) {
              chat.scrollTop = chat.scrollHeight;
            }
            window.scrollTo(0, 0);
          }, 100);
        } else {
          document.body.classList.remove('mop-viewport-locked');
          document.body.style.height = '';
          document.body.style.overflow = '';
        }
      }
    };

    if (window.mopViewportHandler) {
      visualViewport.removeEventListener('resize', window.mopViewportHandler);
      visualViewport.removeEventListener('scroll', window.mopViewportHandler);
    }

    visualViewport.addEventListener('resize', handleResize);
    visualViewport.addEventListener('scroll', handleResize);
    window.mopViewportHandler = handleResize;

    handleResize();
  }

  // ─── DOM Virtualization ──────────────────────────────────────────────────────
  function virtualizeChat() {
    if (!settings.virtualize) return;

    const chatContainer = document.getElementById('chat');
    if (!chatContainer) return;

    const messages = Array.from(chatContainer.querySelectorAll('.mes'));
    const total = messages.length;
    const keep = settings.threshold;

    if (total <= keep) {
      restoreAllArchived();
      return;
    }

    for (let i = 0; i < total - keep; i++) {
      const msg = messages[i];
      if (!msg || msg.classList.contains('mop-archived')) continue;

      if (!archivedNodes.has(msg)) {
        archivedNodes.set(msg, {
          html: msg.innerHTML,
          dataset: { ...msg.dataset },
          attributes: {}
        });

        for (const attr of msg.attributes) {
          if (!['class', 'style', 'data-archived'].includes(attr.name)) {
            archivedNodes.get(msg).attributes[attr.name] = attr.value;
          }
        }
      }

      msg.classList.add('mop-archived');
      msg.dataset.archived = 'true';
      msg.innerHTML = '';
    }

    updateStats();
  }

  function restoreAllArchived() {
    archivedNodes.forEach((data, node) => {
      if (node.classList.contains('mop-archived')) {
        node.classList.remove('mop-archived');
        node.innerHTML = data.html;
        node.removeAttribute('data-archived');
        for (const [key, val] of Object.entries(data.attributes)) {
          node.setAttribute(key, val);
        }
      }
    });
    archivedNodes.clear();
    updateStats();
  }

  // ─── Lazy Loading ────────────────────────────────────────────────────────────
  function enforceLazyLoad() {
    if (!settings.lazyLoad) return;

    const images = document.querySelectorAll('#chat img');
    images.forEach(img => {
      if (!img.hasAttribute('loading')) {
        img.setAttribute('loading', 'lazy');
      }
    });
  }

  function enforceLazyLoadProfile() {
    if (!settings.lazyProfile) return;

    const profileImages = document.querySelectorAll('.avatar img, .mes_avatar img, [class*="profile"] img');

    profileImages.forEach(img => {
      if (!img.classList.contains('mop-lazy-loaded')) {
        img.classList.add('mop-lazy-loaded');

        if ('IntersectionObserver' in window) {
          const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                  img.src = img.dataset.src;
                  img.classList.add('loaded');
                }
                observer.unobserve(img);
              }
            });
          }, { rootMargin: '50px' });

          observer.observe(img);
        } else {
          img.setAttribute('loading', 'lazy');
        }
      }
    });
  }

  // ─── Stats Update ────────────────────────────────────────────────────────────
  function updateStats() {
    const domCount = document.querySelectorAll('*').length;
    const archivedCount = archivedNodes.size;
    const memorySaved = (archivedCount * 0.5).toFixed(1);

    const domEl = document.getElementById('mop-dom-count');
    const archivedEl = document.getElementById('mop-archived-count');
    const memoryEl = document.getElementById('mop-memory-saved');

    if (domEl) domEl.textContent = domCount.toLocaleString();
    if (archivedEl) archivedEl.textContent = archivedCount;
    if (memoryEl) memoryEl.textContent = `${memorySaved} MB`;
  }

  // ─── Floating Button ─────────────────────────────────────────────────────────
  function createFloatingButton() {
    const oldBtn = document.getElementById('mop-floating-btn');
    if (oldBtn) oldBtn.remove();

    const btn = document.createElement('div');
    btn.id = 'mop-floating-btn';
    btn.innerHTML = '📱';
    btn.title = 'Mobile Optimizer Pro - Click to open settings';
    btn.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 20px;
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, #4a9eff, #6c5ce7);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 9999;
      box-shadow: 0 4px 12px rgba(74, 158, 255, 0.4);
      transition: all 0.3s;
      font-size: 24px;
      border: 2px solid rgba(255,255,255,0.2);
    `;

    btn.onmouseover = () => {
      btn.style.transform = 'scale(1.1)';
      btn.style.boxShadow = '0 6px 16px rgba(74, 158, 255, 0.6)';
    };

    btn.onmouseout = () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 4px 12px rgba(74, 158, 255, 0.4)';
    };

    btn.onclick = () => {
      // Toggle the settings panel drawer
      const drawer = document.querySelector('#mop-panel .inline-drawer-content');
      if (drawer) {
        const isHidden = drawer.style.display === 'none' || drawer.style.display === '';
        drawer.style.display = isHidden ? 'block' : 'none';
        // Scroll to settings panel
        const panel = document.getElementById('mop-panel');
        if (panel && isHidden) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        if (typeof toastr !== 'undefined') {
          toastr.info('Click the Extensions icon → Find "Mobile Optimizer Pro"', EXT_DISPLAY);
        }
      }
    };

    document.body.appendChild(btn);
  }

  // ─── Export/Import ───────────────────────────────────────────────────────────
  function exportSettings() {
    const exportData = {
      version: '2.1.0',
      timestamp: new Date().toISOString(),
      settings: settings,
      chatOverrides: chatOverrides
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mobile-optimizer-pro-settings-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (typeof toastr !== 'undefined') {
      toastr.success('Settings exported successfully!', EXT_DISPLAY);
    }
  }

  function importSettings(file) {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);

        if (data.settings) {
          settings = { ...DEFAULTS, ...data.settings };
        }

        if (data.chatOverrides) {
          chatOverrides = data.chatOverrides;
        }

        saveSettings();
        applyAll();

        if (typeof toastr !== 'undefined') {
          toastr.success('Settings imported successfully!', EXT_DISPLAY);
        }

        location.reload();
      } catch (err) {
        console.error(`[${EXT_DISPLAY}] Import failed:`, err);
        if (typeof toastr !== 'undefined') {
          toastr.error('Failed to import settings. Invalid file format.', EXT_DISPLAY);
        }
      }
    };

    reader.readAsText(file);
  }

  // ─── Create Settings Panel (inject into ST sidebar like LumiPulse) ───────────
  function createSettingsPanel() {
    if (document.getElementById('mop-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'mop-panel';
    panel.className = 'inline-drawer';
    panel.innerHTML = `
      <div class="inline-drawer-toggle inline-drawer-header">
        <b style="color:#4a9eff;">📱 Mobile Optimizer Pro</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content" id="mobile_optimizer_pro_settings" style="display:none; padding:12px;">

        <!-- Main Toggle -->
        <div style="margin-bottom:12px;">
          <label style="display:flex;align-items:center;gap:8px;font-weight:bold;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="mop-enabled">
            <span>Enable Mobile Optimizer</span>
          </label>
          <p style="font-size:11px;opacity:0.6;margin:3px 0 0 24px;">Master switch for all optimizations</p>
        </div>

        <!-- Performance Stats -->
        <div style="background:rgba(74,158,255,0.08);border:1px solid rgba(74,158,255,0.2);border-radius:8px;padding:10px;margin-bottom:12px;">
          <div style="font-size:11px;font-weight:bold;margin-bottom:8px;color:#4a9eff;text-transform:uppercase;letter-spacing:0.5px;">📊 Real-time Performance</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;">
            <div>DOM Nodes: <span id="mop-dom-count" style="color:#4a9eff;font-weight:bold;">0</span></div>
            <div>Archived: <span id="mop-archived-count" style="color:#4a9eff;font-weight:bold;">0</span></div>
            <div>Memory Saved: <span id="mop-memory-saved" style="color:#4a9eff;font-weight:bold;">0 MB</span></div>
            <div>Device: <span id="mop-device-perf" style="color:#fbbf24;font-weight:bold;">-</span></div>
          </div>
        </div>

        <!-- Core Settings -->
        <div style="font-size:11px;font-weight:bold;margin-bottom:8px;opacity:0.7;text-transform:uppercase;letter-spacing:0.5px;">⚙️ Core Optimization</div>

        <div style="margin-bottom:7px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="mop-auto-detect">
            <span>Auto-detect Device Performance</span>
          </label>
          <p style="font-size:11px;opacity:0.6;margin:2px 0 0 24px;">Automatically adjust threshold based on device speed</p>
        </div>

        <div style="margin-bottom:7px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="mop-virtualize">
            <span>Smart Message Virtualization</span>
          </label>
          <p style="font-size:11px;opacity:0.6;margin:2px 0 0 24px;">Archive old messages to reduce DOM load</p>
        </div>

        <div style="margin-bottom:10px;font-size:13px;">
          <label style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span>Messages to Keep Visible:</span>
            <input type="range" id="mop-threshold" min="5" max="30" value="12" style="flex:1;min-width:100px;">
            <span id="mop-threshold-value" style="color:#4a9eff;font-weight:bold;min-width:20px;">12</span>
          </label>
        </div>

        <div style="margin-bottom:7px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="mop-lock-viewport">
            <span>Lock Viewport on Keyboard Open</span>
          </label>
          <p style="font-size:11px;opacity:0.6;margin:2px 0 0 24px;">Prevents black screen/lag when keyboard appears</p>
        </div>

        <div style="margin-bottom:7px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="mop-prevent-shift">
            <span>Prevent Keyboard Shift (No Lag Mode)</span>
          </label>
          <p style="font-size:11px;opacity:0.6;margin:2px 0 0 24px;">ไม่เลื่อนช่องพิมพ์ขึ้นเมื่อแป้นพิมพ์เปิด - ลดการแล็ค แต่ช่องพิมพ์อาจถูกบัง</p>
        </div>

        <div style="margin-bottom:7px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="mop-auto-show-keyboard">
            <span>Auto-show Keyboard on Chat Load</span>
          </label>
          <p style="font-size:11px;opacity:0.6;margin:2px 0 0 24px;">เปิด = คีย์บอร์ดเด้งขึ้นมาเองเมื่อเข้าแชท | ปิด = ต้องกดช่องพิมพ์เองเท่านั้น</p>
        </div>

        <div style="margin-bottom:7px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="mop-strip-animations">
            <span>Disable Animations &amp; Transitions</span>
          </label>
        </div>

        <div style="margin-bottom:7px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="mop-hide-avatars">
            <span>Hide Avatars</span>
          </label>
          <p style="font-size:11px;opacity:0.6;margin:2px 0 0 24px;">Reduces image loading overhead</p>
        </div>

        <div style="margin-bottom:7px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="mop-lazy-load">
            <span>Enforce Lazy Loading for Images</span>
          </label>
        </div>

        <div style="margin-bottom:12px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="mop-lazy-profile">
            <span>Lazy Load Profile/Avatar Images</span>
          </label>
          <p style="font-size:11px;opacity:0.6;margin:2px 0 0 24px;">Load profile pictures only when visible</p>
        </div>

        <!-- Extension Manager -->
        <div style="font-size:11px;font-weight:bold;margin-bottom:8px;opacity:0.7;text-transform:uppercase;letter-spacing:0.5px;">🧩 Extension CSS Optimizer</div>
        <p style="font-size:11px;opacity:0.6;margin:0 0 8px;">Select which extensions to optimize (disable heavy CSS)</p>

        <div style="display:flex;gap:5px;margin-bottom:7px;">
          <button id="mop-select-all" style="font-size:11px;padding:4px 10px;cursor:pointer;border-radius:4px;">Select All</button>
          <button id="mop-select-none" style="font-size:11px;padding:4px 10px;cursor:pointer;border-radius:4px;">Select None</button>
          <button id="mop-refresh-ext" style="font-size:11px;padding:4px 10px;cursor:pointer;border-radius:4px;">🔄 Refresh</button>
        </div>

        <div id="mop-ext-list" style="max-height:130px;overflow-y:auto;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:8px;margin-bottom:12px;font-size:12px;">
          <div style="opacity:0.5;">Loading extensions...</div>
        </div>

        <!-- Per-Chat Settings -->
        <div style="font-size:11px;font-weight:bold;margin-bottom:8px;opacity:0.7;text-transform:uppercase;letter-spacing:0.5px;">💬 Per-Chat Settings</div>
        <p style="font-size:11px;opacity:0.6;margin:0 0 8px;">Override settings for specific chats</p>

        <div style="margin-bottom:7px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="mop-per-chat">
            <span>Enable Per-Chat Overrides</span>
          </label>
        </div>

        <div id="mop-chat-overrides" style="display:none;background:rgba(255,255,255,0.05);border-radius:6px;padding:8px;margin-bottom:12px;">
          <div style="font-size:12px;margin-bottom:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="opacity:0.7;">Current Chat:</span>
            <span id="mop-current-chat-name" style="color:#4a9eff;font-weight:bold;">-</span>
            <button id="mop-save-chat-override" style="font-size:11px;padding:3px 8px;cursor:pointer;border-radius:4px;">Save Override</button>
          </div>
          <label style="font-size:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span>Override Threshold:</span>
            <input type="range" id="mop-chat-threshold" min="5" max="30" value="12" style="flex:1;min-width:80px;">
            <span id="mop-chat-threshold-value" style="color:#4a9eff;font-weight:bold;min-width:20px;">12</span>
          </label>
        </div>

        <!-- Theme Support -->
        <div style="font-size:11px;font-weight:bold;margin-bottom:8px;opacity:0.7;text-transform:uppercase;letter-spacing:0.5px;">🎨 Theme Support</div>

        <div style="margin-bottom:7px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="mop-theme-detect">
            <span>Auto-detect Current Theme</span>
          </label>
        </div>

        <div style="margin-bottom:12px;font-size:12px;opacity:0.8;">
          Current Theme: <span id="mop-current-theme" style="color:#4a9eff;font-weight:bold;">-</span>
        </div>

        <!-- Advanced Settings -->
        <div style="font-size:11px;font-weight:bold;margin-bottom:8px;opacity:0.7;text-transform:uppercase;letter-spacing:0.5px;">🔧 Advanced Settings</div>

        <div style="margin-bottom:7px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="mop-aggressive-css">
            <span>Aggressive CSS Stripping</span>
          </label>
          <p style="font-size:11px;opacity:0.6;margin:2px 0 0 24px;">Remove backdrop-filter, box-shadow, and heavy effects</p>
        </div>

        <div style="margin-bottom:12px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="mop-debug">
            <span>Debug Mode</span>
          </label>
          <p style="font-size:11px;opacity:0.6;margin:2px 0 0 24px;">Show detailed logs in console</p>
        </div>

        <!-- Export/Import -->
        <div style="font-size:11px;font-weight:bold;margin-bottom:8px;opacity:0.7;text-transform:uppercase;letter-spacing:0.5px;">💾 Export / Import Settings</div>
        <div style="display:flex;gap:6px;margin-bottom:12px;">
          <button id="mop-export" style="flex:1;padding:7px;cursor:pointer;font-size:12px;border-radius:6px;">📤 Export</button>
          <button id="mop-import" style="flex:1;padding:7px;cursor:pointer;font-size:12px;border-radius:6px;">📥 Import</button>
          <input type="file" id="mop-import-file" accept=".json" style="display:none;">
        </div>

        <!-- Action Buttons -->
        <div style="display:flex;gap:6px;">
          <button id="mop-apply" style="flex:1;padding:9px;cursor:pointer;font-weight:bold;font-size:13px;background:linear-gradient(135deg,#4a9eff,#6c5ce7);color:white;border:none;border-radius:8px;">✅ Apply Settings</button>
          <button id="mop-reset" style="flex:1;padding:9px;cursor:pointer;font-size:13px;border-radius:8px;">🔄 Reset</button>
        </div>

      </div>
    `;

    const target = document.getElementById('extensions_settings');
    if (target) {
      target.appendChild(panel);
    }
  }

  // ─── Settings UI ─────────────────────────────────────────────────────────────
  function initSettingsUI() {
    const checkInterval = setInterval(() => {
      const settingsPanel = document.getElementById('mobile_optimizer_pro_settings');
      if (settingsPanel) {
        clearInterval(checkInterval);
        setupSettingsPanel(settingsPanel);
      }
    }, 100);

    setTimeout(() => clearInterval(checkInterval), 10000);
  }

  function setupSettingsPanel(panel) {
    const fields = {
      enabled: '#mop-enabled',
      autoDetect: '#mop-auto-detect',
      virtualize: '#mop-virtualize',
      threshold: '#mop-threshold',
      lockViewport: '#mop-lock-viewport',
      preventKeyboardShift: '#mop-prevent-shift',
      autoShowKeyboard: '#mop-auto-show-keyboard',
      stripAnimations: '#mop-strip-animations',
      hideAvatars: '#mop-hide-avatars',
      lazyLoad: '#mop-lazy-load',
      lazyProfile: '#mop-lazy-profile',
      aggressiveCss: '#mop-aggressive-css',
      themeDetect: '#mop-theme-detect',
      perChat: '#mop-per-chat',
      debug: '#mop-debug'
    };

    Object.entries(fields).forEach(([key, selector]) => {
      const el = panel.querySelector(selector);
      if (el) {
        if (el.type === 'checkbox') {
          el.checked = settings[key];
        } else if (el.type === 'range') {
          el.value = settings[key];
          const valueEl = panel.querySelector(`${selector}-value`);
          if (valueEl) valueEl.textContent = settings[key];
        }
      }
    });

    const threshold = panel.querySelector('#mop-threshold');
    const thresholdValue = panel.querySelector('#mop-threshold-value');
    if (threshold && thresholdValue) {
      threshold.addEventListener('input', () => {
        thresholdValue.textContent = threshold.value;
      });
    }

    const perChatCheckbox = panel.querySelector('#mop-per-chat');
    const chatOverridesDiv = panel.querySelector('#mop-chat-overrides');
    if (perChatCheckbox && chatOverridesDiv) {
      perChatCheckbox.addEventListener('change', () => {
        chatOverridesDiv.style.display = perChatCheckbox.checked ? 'block' : 'none';
      });
      if (settings.perChat) {
        chatOverridesDiv.style.display = 'block';
      }
    }

    currentChatId = getCurrentChatId();
    const currentChatNameEl = panel.querySelector('#mop-current-chat-name');
    if (currentChatNameEl) {
      currentChatNameEl.textContent = currentChatId || 'Unknown';
    }

    const chatThreshold = panel.querySelector('#mop-chat-threshold');
    const chatThresholdValue = panel.querySelector('#mop-chat-threshold-value');
    if (chatThreshold && chatThresholdValue) {
      chatThreshold.addEventListener('input', () => {
        chatThresholdValue.textContent = chatThreshold.value;
      });
    }

    renderExtensionList(panel);

    const applyBtn = panel.querySelector('#mop-apply');
    const resetBtn = panel.querySelector('#mop-reset');
    const selectAllBtn = panel.querySelector('#mop-select-all');
    const selectNoneBtn = panel.querySelector('#mop-select-none');
    const refreshBtn = panel.querySelector('#mop-refresh-ext');
    const saveChatBtn = panel.querySelector('#mop-save-chat-override');
    const exportBtn = panel.querySelector('#mop-export');
    const importBtn = panel.querySelector('#mop-import');
    const importFile = panel.querySelector('#mop-import-file');

    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        saveSettingsFromUI(panel);
        applyAll();
        if (typeof toastr !== 'undefined') {
          toastr.success('Settings applied successfully!', EXT_DISPLAY);
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all settings to defaults?')) {
          settings = { ...DEFAULTS };
          chatOverrides = {};
          saveSettings();
          location.reload();
        }
      });
    }

    if (selectAllBtn) {
      selectAllBtn.addEventListener('click', () => {
        panel.querySelectorAll('.mop-ext-checkbox').forEach(cb => cb.checked = true);
      });
    }

    if (selectNoneBtn) {
      selectNoneBtn.addEventListener('click', () => {
        panel.querySelectorAll('.mop-ext-checkbox').forEach(cb => cb.checked = false);
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        detectExtensions();
        renderExtensionList(panel);
      });
    }

    if (saveChatBtn) {
      saveChatBtn.addEventListener('click', () => {
        const chatThreshold = panel.querySelector('#mop-chat-threshold');
        if (chatThreshold && currentChatId) {
          chatOverrides[currentChatId] = {
            threshold: parseInt(chatThreshold.value),
            virtualize: settings.virtualize,
            hideAvatars: settings.hideAvatars
          };
          saveSettings();
          if (typeof toastr !== 'undefined') {
            toastr.success('Chat override saved!', EXT_DISPLAY);
          }
        }
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', exportSettings);
    }

    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => importFile.click());
      importFile.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
          importSettings(e.target.files[0]);
        }
      });
    }

    if (statsInterval) clearInterval(statsInterval);
    statsInterval = setInterval(updateStats, 2000);
    updateStats();
    updatePerformanceDisplay();
    detectCurrentTheme();
  }

  function renderExtensionList(panel) {
    const listEl = panel.querySelector('#mop-ext-list');
    if (!listEl) return;

    if (extensionList.length === 0) {
      listEl.innerHTML = '<div style="opacity:0.5;">No extensions detected</div>';
      return;
    }

    listEl.innerHTML = '';
    extensionList.forEach(ext => {
      const item = document.createElement('label');
      item.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:5px;cursor:pointer;font-size:12px;';
      const isChecked = settings.optimizedExtensions.includes(ext.name);
      item.innerHTML = `<input type="checkbox" class="mop-ext-checkbox" data-ext="${ext.name}" ${isChecked ? 'checked' : ''}> ${ext.displayName}`;
      listEl.appendChild(item);
    });
  }

  function saveSettingsFromUI(panel) {
    const fields = {
      enabled: '#mop-enabled',
      autoDetect: '#mop-auto-detect',
      virtualize: '#mop-virtualize',
      threshold: '#mop-threshold',
      lockViewport: '#mop-lock-viewport',
      preventKeyboardShift: '#mop-prevent-shift',
      autoShowKeyboard: '#mop-auto-show-keyboard',
      stripAnimations: '#mop-strip-animations',
      hideAvatars: '#mop-hide-avatars',
      lazyLoad: '#mop-lazy-load',
      lazyProfile: '#mop-lazy-profile',
      aggressiveCss: '#mop-aggressive-css',
      themeDetect: '#mop-theme-detect',
      perChat: '#mop-per-chat',
      debug: '#mop-debug'
    };

    Object.entries(fields).forEach(([key, selector]) => {
      const el = panel.querySelector(selector);
      if (el) {
        if (el.type === 'checkbox') {
          settings[key] = el.checked;
        } else if (el.type === 'range') {
          settings[key] = parseInt(el.value);
        }
      }
    });

    settings.optimizedExtensions = [];
    panel.querySelectorAll('.mop-ext-checkbox:checked').forEach(cb => {
      settings.optimizedExtensions.push(cb.dataset.ext);
    });

    saveSettings();
  }

  // ─── Apply All Optimizations ─────────────────────────────────────────────────
  function applyAll() {
    if (!settings.enabled) {
      restoreAllArchived();
      document.body.classList.remove('mop-viewport-locked', 'mop-no-anim', 'mop-hide-avatars', 'mop-lazy-profile', 'mop-prevent-shift', 'mop-no-auto-focus');
      document.body.style.height = '';
      document.body.style.overflow = '';
      if (window.mopViewportHandler && window.visualViewport) {
        window.visualViewport.removeEventListener('resize', window.mopViewportHandler);
        window.visualViewport.removeEventListener('scroll', window.mopViewportHandler);
      }
      return;
    }

    if (settings.autoDetect) {
      detectDevicePerformance();
    }

    applyChatOverride();
    injectCSS();
    setupViewportLock();
    preventAutoFocus();

    document.body.classList.toggle('mop-no-anim', settings.stripAnimations);
    document.body.classList.toggle('mop-hide-avatars', settings.hideAvatars);
    document.body.classList.toggle('mop-lazy-profile', settings.lazyProfile);

    virtualizeChat();
    enforceLazyLoad();
    enforceLazyLoadProfile();

    if (settings.debug) {
      console.log(`[${EXT_DISPLAY}] Applied optimizations:`, settings);
    }
  }

  // ─── SillyTavern Event Listeners ─────────────────────────────────────────────
  function initSTListeners() {
    if (typeof eventSource === 'undefined') return;

    eventSource.on('MESSAGE_RECEIVED', () => {
      setTimeout(() => {
        virtualizeChat();
        enforceLazyLoad();
        enforceLazyLoadProfile();
      }, 150);
    });

    eventSource.on('CHAT_CHANGED', () => {
      restoreAllArchived();
      currentChatId = getCurrentChatId();
      applyChatOverride();
      setTimeout(virtualizeChat, 200);
    });

    eventSource.on('CHAT_DELETED', () => {
      restoreAllArchived();
    });
  }

  // ─── Initialize ─────────────────────────────────────────────────────────────
  function init() {
    loadSettings();
    detectExtensions();
    createSettingsPanel();

    setTimeout(() => {
      applyAll();
      initSTListeners();
      initSettingsUI();
      createFloatingButton();
    }, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
