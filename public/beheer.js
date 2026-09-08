(function () {
  const detail = document.getElementById('bh-detail');
  const detailInhoud = document.getElementById('bh-detail-inhoud');
  const detailSluit = document.getElementById('bh-detail-sluit');
  const werkKop = document.getElementById('bh-werk-kop');
  const datumEl = document.getElementById('bh-datum');
  const fab = document.getElementById('bh-fab');
  const fabMenu = document.getElementById('bh-fab-menu');

  if (datumEl) {
    datumEl.textContent = new Intl.DateTimeFormat('nl-NL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
  }

  if (werkKop) {
    const onScroll = () => {
      werkKop.classList.toggle('scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function sluitFabMenu() {
    if (!fab || !fabMenu) return;
    fab.setAttribute('aria-expanded', 'false');
    fabMenu.hidden = true;
  }

  if (fab && fabMenu) {
    fab.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = fab.getAttribute('aria-expanded') === 'true';
      fab.setAttribute('aria-expanded', open ? 'false' : 'true');
      fabMenu.hidden = open;
    });
    document.addEventListener('click', (e) => {
      if (!fab.contains(e.target) && !fabMenu.contains(e.target)) sluitFabMenu();
    });
    fabMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => sluitFabMenu());
    });
  }

  function sluitDetail() {
    if (!detail) return;
    detail.classList.remove('open');
    detail.setAttribute('aria-hidden', 'true');
    if (detailInhoud) detailInhoud.innerHTML = '';
    if (history.state?.detail) history.back();
  }

  if (detailSluit) detailSluit.addEventListener('click', sluitDetail);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (detail?.classList.contains('open')) sluitDetail();
      sluitFabMenu();
    }
  });

  async function openDetail(url) {
    if (!detail || !detailInhoud) {
      window.location.href = url;
      return;
    }

    detail.classList.add('open');
    detail.setAttribute('aria-hidden', 'false');
    detailInhoud.innerHTML = '<p class="bh-muted">Laden…</p>';

    try {
      const res = await fetch(url, { headers: { Accept: 'text/html' } });
      if (!res.ok) throw new Error('Laden mislukt');
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const main = doc.querySelector('.bh-main');
      if (!main) throw new Error('Geen inhoud');

      main.querySelector('.bh-demo')?.remove();
      detailInhoud.innerHTML = main.innerHTML;
      detailInhoud.querySelectorAll('a:not([target])').forEach((link) => {
        if (link.classList.contains('bh-detail-link')) return;
        if (link.getAttribute('href')?.startsWith('/beheer/')) {
          link.classList.add('bh-detail-link');
        }
      });
      history.pushState({ detail: url }, '', url);
    } catch {
      detailInhoud.innerHTML =
        '<p class="bh-leeg">Kon deze pagina niet laden.</p><p class="bh-acties"><a class="bh-btn" href="' +
        url +
        '">Volledige pagina openen</a></p>';
    }
  }

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a.bh-detail-link');
    if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (link.target === '_blank') return;
    e.preventDefault();
    openDetail(link.href);
  });

  window.addEventListener('popstate', () => {
    if (!detail?.classList.contains('open')) return;
    if (history.state?.detail) return;
    sluitDetail();
  });

  document.querySelectorAll('[data-bh-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-bh-view');
      if (!view) return;
      document.querySelectorAll('[data-bh-view]').forEach((b) => {
        b.setAttribute('aria-current', b === btn ? 'page' : undefined);
      });
      document.querySelectorAll('[data-bh-panel]').forEach((panel) => {
        panel.hidden = panel.getAttribute('data-bh-panel') !== view;
      });
    });
  });
})();
