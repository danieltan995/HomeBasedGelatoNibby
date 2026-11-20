// Progressive enhancement only: native details remain usable if JS is unavailable.
export function initFlavourCards() {
  document.querySelectorAll<HTMLElement>('[data-flip-card]').forEach((card) => {
    const toggle = card.querySelector<HTMLButtonElement>('[data-flip-toggle]');
    const front = card.querySelector<HTMLElement>('.flip-front');
    const back = card.querySelector<HTMLElement>('.flip-back');
    const label = card.querySelector<HTMLElement>('[data-flip-label]');
    const fallback = card.closest('article')?.querySelector<HTMLElement>('[data-flip-fallback]');
    if (!toggle || !front || !back || !label || !fallback) return;

    const showNotes = (open: boolean) => {
      card.dataset.flipped = String(open);
      toggle.setAttribute('aria-expanded', String(open));
      front.setAttribute('aria-hidden', String(open));
      front.inert = open;
      back.setAttribute('aria-hidden', String(!open));
      back.inert = !open;
      label.textContent = open ? 'Back to cup' : 'Ingredients & allergens';
    };
    toggle.addEventListener('click', () => showNotes(toggle.getAttribute('aria-expanded') !== 'true'));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        showNotes(false);
        toggle.focus({ preventScroll: true });
      }
    });
    showNotes(false);
    card.dataset.ready = '';
    back.hidden = false;
    toggle.hidden = false;
    fallback.hidden = true;
  });
}