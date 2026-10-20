(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const recordsNode = $('#records');
  const countNode = $('#result-count');
  const filtersNode = $('#room-filters');
  const searchNode = $('#search');
  const toastNode = $('#toast');
  const copyDialog = $('#copy-dialog');
  const imageDialog = $('#image-dialog');
  let devices = [];
  let updatedAt = '2026-10-20';
  let publicUrl = '';
  let activeRoom = '全部';
  const expandedIds = new Set();
  let toastTimer;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function escapeWithBreaks(value) {
    return escapeHtml(value).replace(/\n/g, '<br>');
  }

  function safeUrl(value) {
    try {
      if (!String(value || '').trim()) return '';
      const url = new URL(String(value), location.href);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  }

  function safeImagePath(value) {
    const path = String(value || '');
    return /^assets\/[\w./-]+\.(?:webp|png|jpe?g|gif)$/i.test(path) && !path.split('/').includes('..') ? path : '';
  }

  function display(value) {
    return String(value ?? '').trim() || '未提供';
  }

  function modelText(device) {
    return [device.brand, device.model].filter(Boolean).join(' · ');
  }

  function locationText(device) {
    return [device.room, device.location].filter(Boolean).filter((part, index, parts) => parts.indexOf(part) === index).join(' / ');
  }

  function toast(message) {
    clearTimeout(toastTimer);
    toastNode.textContent = message;
    toastNode.classList.add('is-visible');
    toastTimer = setTimeout(() => toastNode.classList.remove('is-visible'), 3500);
  }

  function currentDevices() {
    const query = searchNode.value.trim().toLocaleLowerCase('zh-CN');
    return devices.filter((device) => {
      const inRoom = activeRoom === '全部' || [device.room, device.location].some((part) => String(part || '').includes(activeRoom));
      const matches = !query || [device.name, device.brand, device.model, device.room, device.location]
        .some((part) => String(part || '').toLocaleLowerCase('zh-CN').includes(query));
      return inRoom && matches;
    });
  }

  function renderNotes(notes) {
    const list = Array.isArray(notes) ? notes.slice(0, 3) : [];
    return list.map((note) => `<span>${escapeHtml(note)}</span>`).join('');
  }

  function renderImages(device) {
    const images = Array.isArray(device.images) ? device.images : [];
    const groups = [
      { title: '设备图片与尺寸资料', list: images.filter((image) => image.kind !== 'reference') },
      { title: '其他型号参考图', list: images.filter((image) => image.kind === 'reference') }
    ];
    return groups.map(({ title, list }) => {
      const figures = list.map((image) => {
        const src = safeImagePath(image.src);
        if (!src) return '';
        const label = image.alt || image.caption || '设备资料图片';
        return `<figure class="image-figure">
          <figcaption>${escapeHtml(image.caption || image.alt || '')}</figcaption>
          <button type="button" class="image-frame" data-lightbox src="${escapeHtml(src)}" data-caption="${escapeHtml(image.caption || image.alt || '')}" aria-label="查看大图：${escapeHtml(label)}">
            <img src="${escapeHtml(src)}" alt="${escapeHtml(image.alt || '')}" loading="lazy" decoding="async">
          </button>
          ${image.warning ? `<p class="image-warning">${escapeHtml(image.warning)}</p>` : ''}
        </figure>`;
      }).join('');
      return figures ? `<section class="image-section"><h4>${title}</h4><div class="image-stack">${figures}</div></section>` : '';
    }).join('');
  }

  function normalize(value) {
    return String(value ?? '').replace(/[\s，,。.;；:：/（）()×x\-–—]/g, '').toLocaleLowerCase('zh-CN');
  }

  function renderDetailGroups(device) {
    const mainValues = [device.name, device.brand, device.model, device.room, device.location, device.deviceSize, device.cabinetSize, ...(Array.isArray(device.keyNotes) ? device.keyNotes : [])];
    const primary = new Set(mainValues.map(normalize).filter(Boolean));
    const seen = new Set();
    const groups = Array.isArray(device.detailGroups) ? device.detailGroups : [];
    const rendered = groups.map((group) => {
      const items = (Array.isArray(group.items) ? group.items : []).filter((item) => {
        const value = normalize(item.value);
        const key = `${normalize(item.label)}:${value}`;
        if (!value || primary.has(value) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (!items.length) return '';
      return `<section class="detail-group"><h4>${escapeHtml(group.title || '安装信息')}</h4><dl>${items.map((item) =>
        `<div><dt>${escapeHtml(item.label || '')}</dt><dd>${escapeWithBreaks(item.value || '')}</dd></div>`).join('')}</dl></section>`;
    }).join('');
    const sizeNote = String(device.sizeNote || '').trim();
    const extra = sizeNote && !primary.has(normalize(sizeNote)) ? `<section class="detail-group"><h4>尺寸补充</h4><p>${escapeWithBreaks(sizeNote)}</p></section>` : '';
    const quantity = Number(device.quantity) > 1 ? `<section class="detail-group"><h4>数量</h4><p>${escapeHtml(device.quantity)}</p></section>` : '';
    return extra + quantity + rendered;
  }

  function chevron() {
    return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5"/></svg>';
  }

  function renderRecord(device) {
    const id = `detail-${device.ordinal}`;
    const open = expandedIds.has(String(device.id));
    const productUrl = safeUrl(device.productUrl);
    const details = renderDetailGroups(device);
    const noteItems = (Array.isArray(device.keyNotes) ? device.keyNotes : []).map((note) => `<li>${escapeHtml(note)}</li>`).join('');
    const deviceId = escapeHtml(device.id);
    return `<article class="record" id="k-${device.ordinal}">
      <button class="record-main" type="button" data-toggle="${deviceId}" aria-expanded="${open}" aria-controls="${id}" aria-label="${escapeHtml(device.ordinal + '. ' + device.name)}，${open ? '收起' : '展开'}图片与详情">
        <span class="device-cell"><span class="ordinal">${String(device.ordinal).padStart(2, '0')}</span><span class="device-identity"><span class="device-name">${escapeHtml(device.name)}</span><span class="model-line">${escapeHtml(modelText(device))}</span></span></span>
        <span class="location">${escapeHtml(locationText(device))}</span>
        <span class="size-cell device-size">${escapeWithBreaks(display(device.deviceSize))}</span>
        <span class="size-cell cabinet-size">${escapeWithBreaks(display(device.cabinetSize))}</span>
        <span class="notes-preview">${renderNotes(device.keyNotes)}</span>
        <span class="detail-cue" aria-hidden="true">${chevron()}</span>
      </button>
      <div class="record-detail" id="${id}" ${open ? '' : 'hidden'}>
        <dl class="folded-facts">
          <div><dt>安装位置</dt><dd>${escapeHtml(locationText(device))}</dd></div>
          <div><dt>柜体预留</dt><dd>${escapeWithBreaks(display(device.cabinetSize))}</dd></div>
          ${noteItems ? `<div><dt>关键事项</dt><dd><ul>${noteItems}</ul></dd></div>` : ''}
        </dl>
        ${renderImages(device)}
        ${details ? `<div class="detail-grid">${details}</div>` : ''}
        ${productUrl ? `<a class="product-link" href="${escapeHtml(productUrl)}" target="_blank" rel="noopener noreferrer">打开购买链接 ↗</a>` : ''}
      </div>
      <div class="record-foot">
        <button type="button" class="detail-copy" data-copy-one="${deviceId}" ${open ? '' : 'hidden'}>复制这台要点</button>
        <button type="button" class="detail-toggle" data-toggle="${deviceId}" aria-expanded="${open}" aria-controls="${id}">图片与详情${chevron()}</button>
      </div>
    </article>`;
  }

  function render() {
    const visible = currentDevices();
    recordsNode.innerHTML = visible.length ? visible.map(renderRecord).join('') : '<p class="empty">没有找到符合条件的安装记录。</p>';
    countNode.textContent = `显示 ${visible.length} / ${devices.length} 项`;
    const filtered = activeRoom !== '全部' || searchNode.value.trim() !== '';
    $('#copy-filtered').hidden = !filtered;
    $('.current-count').textContent = visible.length;
    $('#copy-filtered').disabled = !visible.length;
  }

  function formatOne(device) {
    return `${device.ordinal}. ${display(device.name)}\n${locationText(device)}｜${modelText(device)}\n设备尺寸：${display(device.deviceSize)}\n柜体预留：${display(device.cabinetSize)}\n要点：${(Array.isArray(device.keyNotes) ? device.keyNotes : []).join('；')}`;
  }

  function formatCopy(list) {
    const link = safeUrl(publicUrl) || location.origin;
    return `云水观园 2-2-1102 设备尺寸清单\n更新日期：${updatedAt}\n安装图片与详情见链接：${link}\n\n${list.map(formatOne).join('\n\n')}`;
  }

  async function copyList(list) {
    if (!list.length) return;
    const content = formatCopy(list);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(content);
      toast(`已复制 ${list.length} 项要点，可粘贴至微信`);
    } catch {
      $('#manual-copy').value = content;
      copyDialog.showModal();
      $('#manual-copy').focus();
      $('#manual-copy').select();
    }
  }

  function setExpanded(article, id, open) {
    if (open) expandedIds.add(id);
    else expandedIds.delete(id);
    const device = devices.find((item) => String(item.id) === id);
    article.querySelectorAll('[data-toggle]').forEach((node) => {
      node.setAttribute('aria-expanded', String(open));
      if (node.classList.contains('record-main')) {
        node.setAttribute('aria-label', `${device?.ordinal || ''}. ${device?.name || '设备'}，${open ? '收起' : '展开'}图片与详情`);
      }
    });
    const detail = article.querySelector('.record-detail');
    if (detail) detail.hidden = !open;
    const copy = article.querySelector('.detail-copy');
    if (copy) copy.hidden = !open;
  }

  function openLightbox(button) {
    const img = button.querySelector('img');
    if (!img) return;
    const caption = button.dataset.caption || img.alt || '大图';
    $('#image-dialog-caption').textContent = caption;
    const preview = $('#image-dialog-img');
    preview.src = button.getAttribute('src') || img.currentSrc || img.src;
    preview.alt = img.alt || caption;
    imageDialog.showModal();
  }

  async function downloadWorkbook(event) {
    event.preventDefault();
    const href = event.currentTarget.href;
    if (/MicroMessenger/i.test(navigator.userAgent)) {
      window.location.assign(href);
      return;
    }
    toast('正在准备表格…');
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = new Blob([await response.arrayBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = '云水观园设备尺寸清单.xlsx';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('表格已下载');
    } catch (error) {
      console.error('表格导出失败：', error);
      toast('表格导出失败，请稍后重试');
    }
  }

  async function loadData() {
    recordsNode.innerHTML = '<p class="loading">正在读取设备资料…</p>';
    countNode.textContent = '正在读取清单…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('./devices.json', { signal: controller.signal, cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload.devices) || !payload.devices.length || payload.devices.some((item) => !item.id || !item.name)) throw new Error('设备资料格式不完整');
      devices = payload.devices.map((device, index) => ({ ...device, ordinal: index + 1 }));
      updatedAt = payload.updatedAt || updatedAt;
      publicUrl = payload.publicUrl || '';
      $('#update-date').textContent = `更新于${updatedAt}`;
      $('#copy-all').disabled = false;
      render();
    } catch (error) {
      recordsNode.innerHTML = '<div class="error-panel"><strong>设备资料未能载入</strong><p>请检查网络后重试。</p><button class="action secondary" id="retry-load" type="button">重新载入</button></div>';
      countNode.textContent = '资料载入失败';
      console.error('设备资料载入失败：', error);
    } finally { clearTimeout(timeout); }
  }

  filtersNode.addEventListener('click', (event) => {
    const button = event.target.closest('[data-room]');
    if (!button) return;
    activeRoom = button.dataset.room;
    filtersNode.querySelectorAll('[data-room]').forEach((chip) => {
      const active = chip === button;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', String(active));
    });
    render();
  });
  searchNode.addEventListener('input', render);
  $('#filter-toggle').addEventListener('click', () => {
    const open = $('#filter-toggle').getAttribute('aria-expanded') !== 'true';
    $('#filter-toggle').setAttribute('aria-expanded', String(open));
    $('#filter-panel').hidden = !open;
  });
  $('.view-switch').addEventListener('click', (event) => {
    const button = event.target.closest('[data-view]');
    if (!button) return;
    $('#sheet').dataset.view = button.dataset.view;
    $('.view-switch').querySelectorAll('[data-view]').forEach((item) => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
  });
  recordsNode.addEventListener('click', (event) => {
    const lightbox = event.target.closest('[data-lightbox]');
    if (lightbox) { openLightbox(lightbox); return; }
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      const id = toggle.dataset.toggle;
      const article = toggle.closest('.record');
      setExpanded(article, id, !expandedIds.has(id));
      return;
    }
    const copy = event.target.closest('[data-copy-one]');
    if (copy) { const device = devices.find((item) => String(item.id) === copy.dataset.copyOne); if (device) copyList([device]); return; }
    if (event.target.id === 'retry-load') loadData();
  });
  $('#copy-all').addEventListener('click', () => copyList(devices));
  $('#copy-filtered').addEventListener('click', () => copyList(currentDevices()));
  $('#export-sheet').addEventListener('click', downloadWorkbook);
  $('#close-copy').addEventListener('click', () => copyDialog.close());
  $('#select-copy').addEventListener('click', () => { $('#manual-copy').focus(); $('#manual-copy').select(); });
  $('#close-image').addEventListener('click', () => imageDialog.close());
  imageDialog.addEventListener('click', (event) => { if (event.target === imageDialog) imageDialog.close(); });
  loadData();
})();
