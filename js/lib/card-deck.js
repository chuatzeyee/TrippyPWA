// Card-deck: a no-scroll, one-card-at-a-time pager for square-screen mode.
//
// Given a container holding N `.card-deck-slide` children, it shows one slide
// at a time and pages between them via swipe, tap zones, arrow buttons, and
// arrow keys. The deck itself never scrolls vertically; an individual slide may
// scroll internally if its content overflows (rare on a square screen, but a
// safety valve).
//
// Markup contract (caller-provided):
//   <div class="card-deck" data-deck>
//     <div class="card-deck-track">
//       <section class="card-deck-slide">...</section>
//       <section class="card-deck-slide">...</section>
//     </div>
//   </div>
// The chrome (progress dots, prev/next buttons) is injected by mountCardDeck().

const SWIPE_THRESHOLD = 40; // px of horizontal travel before a swipe counts

/**
 * @typedef {Object} DeckHandle
 * @property {(i: number) => void} goTo
 * @property {() => void} next
 * @property {() => void} prev
 * @property {() => number} index
 * @property {() => void} destroy
 */

/**
 * Mount the pager behaviour onto a `[data-deck]` container.
 * @param {HTMLElement} deck
 * @param {{ initialIndex?: number, onChange?: (i: number) => void, label?: string }} [opts]
 * @returns {DeckHandle | null}
 */
export function mountCardDeck(deck, opts = {}) {
  if (!deck) return null;
  const track = deck.querySelector('.card-deck-track');
  if (!track) return null;
  const slides = Array.from(track.children).filter(el => el.classList.contains('card-deck-slide'));
  if (slides.length === 0) return null;

  let index = Math.min(Math.max(opts.initialIndex || 0, 0), slides.length - 1);

  const nav = document.createElement('div');
  nav.className = 'card-deck-nav';
  nav.innerHTML = `
    <button class="card-deck-btn card-deck-btn--prev" aria-label="Previous">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
    </button>
    <div class="card-deck-dots" role="tablist" aria-label="${opts.label || 'Cards'}">
      ${slides.map((_, i) => `<button class="card-deck-dot" role="tab" aria-label="Card ${i + 1} of ${slides.length}" data-deck-dot="${i}"></button>`).join('')}
    </div>
    <button class="card-deck-btn card-deck-btn--next" aria-label="Next">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
    </button>
  `;
  deck.appendChild(nav);

  const dots = Array.from(nav.querySelectorAll('[data-deck-dot]'));
  const prevBtn = nav.querySelector('.card-deck-btn--prev');
  const nextBtn = nav.querySelector('.card-deck-btn--next');

  function render() {
    track.style.transform = `translateX(${-index * 100}%)`;
    slides.forEach((s, i) => {
      const active = i === index;
      s.classList.toggle('card-deck-slide--active', active);
      s.setAttribute('aria-hidden', active ? 'false' : 'true');
      // Keep offscreen slides out of the tab order.
      s.querySelectorAll('a,button,input,select,textarea,[tabindex]').forEach(el => {
        if (active) el.removeAttribute('tabindex');
        else el.setAttribute('tabindex', '-1');
      });
    });
    dots.forEach((d, i) => d.classList.toggle('card-deck-dot--active', i === index));
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === slides.length - 1;
  }

  function goTo(i) {
    const clamped = Math.min(Math.max(i, 0), slides.length - 1);
    if (clamped === index) return;
    index = clamped;
    render();
    opts.onChange?.(index);
  }
  const next = () => goTo(index + 1);
  const prev = () => goTo(index - 1);

  const onNavClick = (e) => {
    const dot = e.target.closest('[data-deck-dot]');
    if (dot) { goTo(Number(dot.dataset.deckDot)); return; }
    if (e.target.closest('.card-deck-btn--next')) next();
    else if (e.target.closest('.card-deck-btn--prev')) prev();
  };
  nav.addEventListener('click', onNavClick);

  // Swipe (touch + pointer).
  let startX = 0, startY = 0, tracking = false;
  const onStart = (e) => {
    const p = e.touches ? e.touches[0] : e;
    startX = p.clientX; startY = p.clientY; tracking = true;
  };
  const onEnd = (e) => {
    if (!tracking) return;
    tracking = false;
    const p = e.changedTouches ? e.changedTouches[0] : e;
    const dx = p.clientX - startX;
    const dy = p.clientY - startY;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) next(); else prev();
  };
  track.addEventListener('touchstart', onStart, { passive: true });
  track.addEventListener('touchend', onEnd, { passive: true });
  track.addEventListener('pointerdown', onStart);
  track.addEventListener('pointerup', onEnd);

  // Arrow keys when the deck (or its content) holds focus.
  const onKey = (e) => {
    if (e.key === 'ArrowRight') { next(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { prev(); e.preventDefault(); }
  };
  deck.addEventListener('keydown', onKey);

  render();

  return {
    goTo, next, prev,
    index: () => index,
    destroy() {
      nav.removeEventListener('click', onNavClick);
      track.removeEventListener('touchstart', onStart);
      track.removeEventListener('touchend', onEnd);
      track.removeEventListener('pointerdown', onStart);
      track.removeEventListener('pointerup', onEnd);
      deck.removeEventListener('keydown', onKey);
      nav.remove();
    }
  };
}

/**
 * Take the already-rendered child sections of `host` and reorganise them into a
 * card deck (one section per slide), then mount paging. Useful for square mode
 * where a normal scrolling panel should page instead. Each direct child that
 * matches `slideSelector` becomes one slide.
 * @param {HTMLElement} host
 * @param {{ slideSelector?: string, label?: string, deckClass?: string }} [opts]
 * @returns {DeckHandle | null}
 */
export function wrapChildrenIntoDeck(host, opts = {}) {
  if (!host) return null;
  const sel = opts.slideSelector || ':scope > *';
  const sections = Array.from(host.querySelectorAll(sel)).filter(el => !el.classList.contains('card-deck'));
  if (sections.length === 0) return null;

  const deck = document.createElement('div');
  deck.className = `card-deck${opts.deckClass ? ` ${opts.deckClass}` : ''}`;
  deck.setAttribute('data-deck', '');
  if (opts.label) deck.setAttribute('aria-label', opts.label);
  const track = document.createElement('div');
  track.className = 'card-deck-track';
  deck.appendChild(track);

  for (const section of sections) {
    const slide = document.createElement('section');
    slide.className = 'card-deck-slide';
    slide.appendChild(section);
    track.appendChild(slide);
  }
  host.appendChild(deck);
  return mountCardDeck(deck, { label: opts.label });
}

/**
 * Helper to wrap an array of HTML strings into deck markup.
 * @param {string[]} slidesHtml - inner HTML for each slide
 * @param {{ deckClass?: string, label?: string }} [opts]
 * @returns {string}
 */
export function buildDeckHtml(slidesHtml, opts = {}) {
  const cls = opts.deckClass ? ` ${opts.deckClass}` : '';
  return `
    <div class="card-deck${cls}" data-deck${opts.label ? ` aria-label="${opts.label}"` : ''}>
      <div class="card-deck-track">
        ${slidesHtml.map(html => `<section class="card-deck-slide">${html}</section>`).join('')}
      </div>
    </div>
  `;
}
