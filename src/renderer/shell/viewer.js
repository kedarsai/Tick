'use strict';
/* The picture viewer.
 *
 * Opening a screenshot in the OS photo app throws away everything around it -
 * what you wrote, when you grabbed it, and what you were about to do with it.
 * This keeps all of that beside the picture, so you can read it, edit it and
 * file it without leaving.
 */
(function (global) {
  const esc = (v) => Fmt.escapeHtml(v);

  let root = null;
  let current = null;      // the config of whatever is open
  let zoomed = false;

  function build() {
    if (root) return root;
    root = document.createElement('div');
    root.className = 'viewer';
    root.hidden = true;
    root.innerHTML = `
      <div class="viewer__panel">
        <div class="viewer__stage" id="vStage">
          <img class="viewer__img" id="vImg" alt="" />
          <div class="viewer__crop" id="vCropBox" hidden></div>
          <button class="viewer__zoom" id="vZoom">Actual size</button>
          <div class="viewer__cropHint" id="vCropHint" hidden>Drag the part you want to keep</div>
        </div>

        <aside class="viewer__side">
          <div class="viewer__head">
            <span class="stamp" id="vKind">Capture</span>
            <button class="tb__btn" id="vClose" title="Close (Esc)">&#10005;</button>
          </div>

          <div class="viewer__meta" id="vMeta"></div>

          <textarea class="input viewer__text" id="vText" spellcheck="true"
                    placeholder="Add a note about this picture..."></textarea>

          <div class="viewer__actions" id="vActions"></div>

          <div class="viewer__foot">
            <button class="btn btn--ghost small" id="vCrop" hidden>Crop</button>
            <button class="btn btn--primary small" id="vCropApply" hidden>Apply</button>
            <button class="btn btn--ghost small" id="vCropCancel" hidden>Cancel</button>
            <button class="btn btn--ghost small" id="vCropUndo" hidden>Undo crop</button>
            <button class="btn btn--ghost small" id="vCopy">Copy image</button>
            <button class="btn btn--ghost small" id="vOpen">Open externally</button>
          </div>
        </aside>
      </div>`;
    document.body.appendChild(root);

    root.addEventListener('click', (e) => { if (e.target === root) close(); });
    root.querySelector('#vClose').addEventListener('click', close);
    root.querySelector('#vZoom').addEventListener('click', toggleZoom);
    root.querySelector('#vImg').addEventListener('click', toggleZoom);

    root.querySelector('#vCopy').addEventListener('click', async (e) => {
      if (!current) return;
      await window.tick.copyImage(current.shot.path);
      flash(e.currentTarget, 'Copied');
    });
    root.querySelector('#vOpen').addEventListener('click', () => {
      if (current) window.tick.openFile(current.shot.path);
    });

    // Saving the text is the caller's business; we just hand it back.
    const text = root.querySelector('#vText');
    text.addEventListener('input', debounceSave);

    root.querySelector('#vActions').addEventListener('click', (e) => {
      const btn = e.target.closest('.viewerAct');
      if (!btn || !current) return;
      const action = (current.actions || []).find((a) => a.id === btn.dataset.act);
      if (!action) return;
      flushText();
      close();
      action.run();
    });

    wireCrop();

    document.addEventListener('keydown', (e) => {
      if (!root || root.hidden) return;
      if (e.key !== 'Escape') return;
      e.preventDefault();
      // Escape backs out of the crop first, and only then out of the picture.
      if (cropping) endCropMode(); else close();
    });

    return root;
  }

  // ------------------------------------------------------------------ crop
  /* Cropping writes a new pair of files and leaves the old ones alone, so
     undo is simply "put the old record back" and nothing has to argue with
     the image cache. Closing the viewer throws away whichever copy lost. */
  let cropping = false;
  let dragFrom = null;
  let dragRect = null;
  let undoShot = null;        // the picture before the crop, while it can come back

  function cropButtons() {
    const on = (id, visible) => { root.querySelector(id).hidden = !visible; };
    const canCrop = !!(current && current.onShot);
    on('#vCrop', canCrop && !cropping);
    on('#vCropApply', cropping);
    on('#vCropCancel', cropping);
    on('#vCropUndo', !cropping && !!undoShot);
    root.querySelector('#vCropHint').hidden = !cropping;
    root.querySelector('#vCropApply').disabled = !dragRect;
    root.dataset.cropping = cropping ? 'yes' : 'no';
  }

  function startCropMode() {
    if (!current || !current.onShot) return;
    cropping = true;
    dragRect = null;
    if (zoomed) toggleZoom();          // crop against what you can see
    drawCropBox(null);
    cropButtons();
  }

  function endCropMode() {
    cropping = false;
    dragFrom = null;
    dragRect = null;
    drawCropBox(null);
    cropButtons();
  }

  function drawCropBox(rect) {
    const box = root.querySelector('#vCropBox');
    if (!rect) { box.hidden = true; return; }
    const img = root.querySelector('#vImg').getBoundingClientRect();
    const stage = root.querySelector('#vStage').getBoundingClientRect();
    box.hidden = false;
    box.style.left = `${img.left - stage.left + Math.min(rect.x, rect.x + rect.width)}px`;
    box.style.top = `${img.top - stage.top + Math.min(rect.y, rect.y + rect.height)}px`;
    box.style.width = `${Math.abs(rect.width)}px`;
    box.style.height = `${Math.abs(rect.height)}px`;
  }

  function wireCrop() {
    const stage = root.querySelector('#vStage');
    const img = root.querySelector('#vImg');

    stage.addEventListener('pointerdown', (e) => {
      if (!cropping || e.button !== 0) return;
      const box = img.getBoundingClientRect();
      e.preventDefault();
      stage.setPointerCapture(e.pointerId);
      dragFrom = { x: e.clientX - box.left, y: e.clientY - box.top };
      dragRect = null;
      drawCropBox(null);
    });

    stage.addEventListener('pointermove', (e) => {
      if (!cropping || !dragFrom) return;
      const box = img.getBoundingClientRect();
      dragRect = {
        x: dragFrom.x,
        y: dragFrom.y,
        width: (e.clientX - box.left) - dragFrom.x,
        height: (e.clientY - box.top) - dragFrom.y
      };
      drawCropBox(dragRect);
      cropButtons();
    });

    const finish = () => { dragFrom = null; cropButtons(); };
    stage.addEventListener('pointerup', finish);
    stage.addEventListener('pointercancel', finish);

    root.querySelector('#vCrop').addEventListener('click', startCropMode);
    root.querySelector('#vCropCancel').addEventListener('click', endCropMode);
    root.querySelector('#vCropApply').addEventListener('click', applyCrop);
    root.querySelector('#vCropUndo').addEventListener('click', undoCrop);
  }

  async function applyCrop() {
    if (!cropping || !dragRect || !current || !current.onShot) return;
    const img = root.querySelector('#vImg');
    const shown = { width: img.clientWidth, height: img.clientHeight };
    const real = { width: img.naturalWidth, height: img.naturalHeight };
    // The rectangle was drawn over the picture as displayed; the main process
    // scales it onto the real pixels.
    const rect = {
      x: dragRect.x * (real.width / shown.width),
      y: dragRect.y * (real.height / shown.height),
      width: dragRect.width * (real.width / shown.width),
      height: dragRect.height * (real.height / shown.height)
    };

    const previous = current.shot;
    const next = await window.tick.shots.crop(previous, rect);
    endCropMode();
    if (!next) return;

    // Only one step back: a second crop makes the first one permanent.
    if (undoShot) window.tick.shots.discard(undoShot);
    undoShot = previous;
    showShot(next);
    current.onShot(next);
    cropButtons();
  }

  function undoCrop() {
    if (!undoShot || !current || !current.onShot) return;
    const cropped = current.shot;
    showShot(undoShot);
    current.onShot(undoShot);
    undoShot = null;
    window.tick.shots.discard(cropped);
    cropButtons();
  }

  /** Put a picture on the stage and keep the meta line honest about its size. */
  function showShot(shot) {
    current.shot = shot;
    root.querySelector('#vImg').src = shot.url || shot.thumbUrl;
    const size = root.querySelector('[data-meta="size"]');
    if (size) size.textContent = `${shot.width} x ${shot.height}`;
  }

  let saveTimer = null;
  function debounceSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushText, 400);
  }

  function flushText() {
    clearTimeout(saveTimer);
    if (!current || !current.onText) return;
    const value = root.querySelector('#vText').value;
    if (value !== current.text) {
      current.text = value;
      current.onText(value);
    }
  }

  function flash(btn, label) {
    const old = btn.textContent;
    btn.textContent = label;
    setTimeout(() => { btn.textContent = old; }, 1100);
  }

  function toggleZoom() {
    if (cropping) return;          // while cropping, a click is a drag
    zoomed = !zoomed;
    root.dataset.zoom = zoomed ? 'actual' : 'fit';
    root.querySelector('#vZoom').textContent = zoomed ? 'Fit to window' : 'Actual size';
  }

  /**
   * @param {object} cfg
   *   shot     {thumbUrl,url,path,width,height}
   *   kind     label in the corner
   *   text     editable text beside the picture
   *   onText   called when that text changes
   *   meta     [{label, value}]
   *   actions  [{id, label, accent, run}]
   */
  function open(cfg) {
    build();
    current = cfg;
    zoomed = false;
    cropping = false;
    dragFrom = null;
    dragRect = null;
    undoShot = null;
    root.dataset.zoom = 'fit';
    root.querySelector('#vZoom').textContent = 'Actual size';

    root.querySelector('#vImg').src = cfg.shot.url || cfg.shot.thumbUrl;
    root.querySelector('#vKind').textContent = cfg.kind || 'Capture';

    root.querySelector('#vMeta').innerHTML = (cfg.meta || []).map((m) => `
      <div class="viewer__metaRow">
        <span class="viewer__metaLabel">${esc(m.label)}</span>
        <span class="viewer__metaValue" data-meta="${esc(String(m.label).toLowerCase())}">${esc(m.value)}</span>
      </div>`).join('');

    const text = root.querySelector('#vText');
    text.value = cfg.text || '';
    text.disabled = !cfg.onText;
    text.placeholder = cfg.placeholder || 'Add a note about this picture...';

    root.querySelector('#vActions').innerHTML = (cfg.actions || []).length
      ? `<div class="stamp viewer__actionsLabel">${esc(cfg.actionsLabel || 'File it')}</div>
         <div class="viewer__actionGrid">
           ${cfg.actions.map((a) => `
             <button class="viewerAct" data-act="${esc(a.id)}"
                     style="--act:${esc(a.accent || 'var(--ink)')}"
                     title="${esc(a.hint || a.label)}">${esc(a.label)}</button>`).join('')}
         </div>`
      : '';

    drawCropBox(null);
    cropButtons();

    root.hidden = false;
    requestAnimationFrame(() => text.focus());
  }

  function close() {
    if (!root || root.hidden) return;
    flushText();
    endCropMode();
    // Closing settles the crop: the picture it replaced is not coming back.
    if (undoShot) {
      window.tick.shots.discard(undoShot);
      undoShot = null;
    }
    root.hidden = true;
    root.querySelector('#vImg').removeAttribute('src');
    current = null;
  }

  global.Viewer = { open, close };
})(window);
