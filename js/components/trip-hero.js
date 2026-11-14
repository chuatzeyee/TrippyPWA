// Trip page header photo ("hero"): markup, the credit line, and swapping the
// photo in place when a new cover arrives (no full re-render, so scroll,
// open days and the chat drawer stay as they are).
//
// `hero` comes from heroCover() in ../lib/trip-cover.js: { src, srcset, sizes,
// focusY, credit }. `parts` are the pre-rendered pieces the trip page owns:
// { title, flagHtml, countdownHtml, datesHtml }.

const escapeHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function imgHtml(hero, alt) {
  const srcset = hero.srcset ? ` srcset="${escapeHtml(hero.srcset)}" sizes="${escapeHtml(hero.sizes)}"` : '';
  return `<img class="td-hero-img" src="${escapeHtml(hero.src)}"${srcset} alt="${escapeHtml(alt)}" loading="eager" decoding="async" fetchpriority="high">`;
}

/** The small "Photo: creator, source" line at the bottom right, or ''. */
export function heroCreditHtml(hero) {
  const text = hero?.credit?.text;
  if (!text) return '';
  // title: the whole credit stays readable when a narrow screen cuts it short.
  const t = escapeHtml(text);
  return hero.credit.link
    ? `<a class="td-hero-credit" href="${escapeHtml(hero.credit.link)}" target="_blank" rel="noopener noreferrer" title="${t}">${t}</a>`
    : `<span class="td-hero-credit" title="${t}">${t}</span>`;
}

// On phones the credit gets its own line under the title (see trip-detail.css).
const CREDIT_CLASS = 'td-hero--credit';
const heroClass = (hero) => (hero?.credit?.text ? `td-hero ${CREDIT_CLASS}` : 'td-hero');

/**
 * The whole hero block.
 * @param {{ src: string, srcset: string, sizes: string, focusY: number, credit: object|null }} hero
 * @param {{ title: string, flagHtml?: string, countdownHtml?: string, datesHtml?: string }} parts
 */
export function heroHtml(hero, { title, flagHtml = '', countdownHtml = '', datesHtml = '' }) {
  return `
        <div class="${heroClass(hero)}" id="td-hero" style="--hero-focus-y: ${Number(hero.focusY) || 0}%">
          ${imgHtml(hero, title)}
          <div class="td-hero-overlay"></div>
          ${countdownHtml ? `<div class="td-hero-countdown">${countdownHtml}</div>` : ''}
          ${datesHtml}
          <div class="td-hero-caption">
            ${flagHtml ? `<span class="td-hero-flag">${flagHtml}</span>` : ''}
            <h1 class="td-hero-title">${escapeHtml(title)}</h1>
          </div>
          ${heroCreditHtml(hero)}
        </div>`;
}

// Built in the live document (not a <template>, whose inert content never
// loads images), so the new photo starts downloading before it is shown.
function fromHtml(html) {
  const holder = document.createElement('div');
  holder.innerHTML = html.trim();
  return holder.firstElementChild;
}

// Let the new photo decode before it replaces anything, so the header never
// flashes empty. A decode failure (offline, 404) leaves the page as it was.
async function decoded(img) {
  try {
    await img.decode();
    return true;
  } catch {
    return img.complete && img.naturalWidth > 0;
  }
}

/**
 * Show a new cover in the trip page header without re-rendering the page.
 * Swaps the photo and credit of an existing hero, or replaces the plain
 * (flag and title) header with a hero.
 * @param {HTMLElement} wrap the .td-wrap of the live view
 * @param {object} hero heroCover() result
 * @param {object} parts see heroHtml
 * @returns {Promise<HTMLElement|null>} the hero element when one was inserted (needs the sticky-strip observer), else null
 */
export async function swapHeroCover(wrap, hero, parts) {
  if (!wrap?.isConnected || !hero?.src) return null;
  const next = fromHtml(heroHtml(hero, parts));
  const nextImg = next.querySelector('.td-hero-img');
  if (!(await decoded(nextImg)) || !wrap.isConnected) return null;

  const current = wrap.querySelector('#td-hero');
  if (current) {
    current.style.setProperty('--hero-focus-y', `${Number(hero.focusY) || 0}%`);
    current.querySelector('.td-hero-img')?.replaceWith(nextImg);
    current.querySelector('.td-hero-credit')?.remove();
    const credit = next.querySelector('.td-hero-credit');
    if (credit) current.append(credit);
    current.classList.toggle(CREDIT_CLASS, Boolean(credit));
    return null;
  }

  // Plain header: the countdown sits loose under the top bar and the title is
  // in .td-header; the hero carries both.
  const topbar = wrap.querySelector(':scope > .td-topbar');
  if (!topbar) return null;
  wrap.querySelector(':scope > .td-countdown')?.remove();
  wrap.querySelector(':scope > .td-header')?.remove();
  topbar.after(next);
  return next;
}
