(function () {
  const form = document.getElementById('mailtemplate-form');
  const preview = document.getElementById('mail-preview');
  const variabelen = document.getElementById('mail-variabelen');
  if (!form || !preview) return;

  let timer = null;

  function huidigeVelden() {
    const data = new FormData(form);
    const velden = {};
    for (const [k, v] of data.entries()) {
      if (k === 'actie') continue;
      velden[k] = String(v);
    }
    velden.actief = form.querySelector('[name=actief]')?.checked ?? false;
    velden.automatischVersturen = form.querySelector('[name=automatischVersturen]')?.checked ?? false;
    velden.conceptKlaarzetten = form.querySelector('[name=conceptKlaarzetten]')?.checked ?? false;
    return velden;
  }

  async function verversPreview() {
    const pad = window.location.pathname.replace(/\/$/, '');
    try {
      const res = await fetch(pad + '/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/html' },
        body: JSON.stringify(huidigeVelden()),
      });
      if (!res.ok) return;
      preview.innerHTML = await res.text();
    } catch {
      /* stil */
    }
  }

  function planPreview() {
    clearTimeout(timer);
    timer = setTimeout(verversPreview, 280);
  }

  form.querySelectorAll('[data-mail-veld], textarea, input').forEach((el) => {
    el.addEventListener('input', planPreview);
  });

  if (variabelen) {
    variabelen.addEventListener('click', (e) => {
      const knop = e.target.closest('[data-var]');
      if (!knop) return;
      const token = knop.getAttribute('data-var');
      const actief = document.activeElement;
      if (actief && (actief.tagName === 'INPUT' || actief.tagName === 'TEXTAREA')) {
        const start = actief.selectionStart ?? actief.value.length;
        const end = actief.selectionEnd ?? start;
        actief.value = actief.value.slice(0, start) + token + actief.value.slice(end);
        actief.focus();
        actief.selectionStart = actief.selectionEnd = start + token.length;
        planPreview();
      }
    });
  }

  planPreview();
})();
