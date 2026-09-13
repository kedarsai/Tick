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
          <button class="viewer__zoom" id="vZoom">Actual size</button>
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

    document.addEventListener('keydown', (e) => {
      if (!root || root.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
    });

    return root;
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
    root.dataset.zoom = 'fit';
    root.querySelector('#vZoom').textContent = 'Actual size';

    root.querySelector('#vImg').src = cfg.shot.url || cfg.shot.thumbUrl;
    root.querySelector('#vKind').textContent = cfg.kind || 'Capture';

    root.querySelector('#vMeta').innerHTML = (cfg.meta || []).map((m) => `
      <div class="viewer__metaRow">
        <span class="viewer__metaLabel">${esc(m.label)}</span>
        <span class="viewer__metaValue">${esc(m.value)}</span>
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

    root.hidden = false;
    requestAnimationFrame(() => text.focus());
  }

  function close() {
    if (!root || root.hidden) return;
    flushText();
    root.hidden = true;
    root.querySelector('#vImg').removeAttribute('src');
    current = null;
  }

  global.Viewer = { open, close };
})(window);
