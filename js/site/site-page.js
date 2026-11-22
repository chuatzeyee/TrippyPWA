// The frame of the site pages (#/about, #/privacy, #/terms): the title and intro, the language
// switch, the date a legal text was last updated, the "On this page" list that follows the scroll,
// and the sections. A page is content data (js/site/pages/<page>.<language>.js, shape in
// js/site/content.js) plus this frame. sitePageHtml is pure; renderSitePage puts it in #app.
import { LANGUAGES, getLanguage, languageName, languageReady, onLanguageChange, t as translate, tFor } from '../lib/i18n.js';
import { SITE_INFO, updatedOn } from '../data/site-info.js';
import { onRouteLeave } from '../router.js';
import { drawableSections, factPlaces, formatUpdated, inlineHtml, sectionsHtml, tocHtml } from './content.js';
import { isSitePage, loadSitePage } from './pages.js';
import { bindLanguageSwitches, languageSwitchHtml, restoreLanguageSwitchFocus } from './language-switch.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const tagOf = (code) => (LANGUAGES.find((language) => language.code === code) ?? LANGUAGES[0]).tag;

/** How far under the top of the window a section's heading counts as reached (the bar, and some air). */
const SPY_OFFSET_PX = 120;
/** From this width the "On this page" list is a column beside the text, and stays open. */
const WIDE_QUERY = '(min-width: 1024px)';

/**
 * The whole page as markup.
 * @param {Object} input
 * @param {string} input.pageId            'about' | 'privacy' | 'terms'
 * @param {import('./content.js').SitePage} input.page
 * @param {string} input.language          the language on screen (the switch, the frame's own words)
 * @param {string} [input.contentLanguage] the language the content is written in; English on a fallback
 * @param {boolean} [input.fallback]       the content is English because the reader's language has no page
 * @param {string|null} [input.updated]    YYYY-MM-DD for a legal text
 * @param {object} [input.info]            js/data/site-info.js SITE_INFO
 * @param {(key: string, vars?: object) => string} [input.t]
 * @returns {string}
 */
export function sitePageHtml({ pageId, page, language, contentLanguage = language, fallback = false, updated = null, info = SITE_INFO, t = tFor(language) }) {
  // The facts are filled in the language of the text they sit in.
  const ctx = { places: factPlaces(info, tFor(contentLanguage)) };
  const intro = (Array.isArray(page.intro) ? page.intro : [page.intro]).filter((line) => typeof line === 'string' && line.trim())
    .map((line) => `<p class="site-intro">${inlineHtml(line, ctx)}</p>`).join('');
  const date = formatUpdated(updated, tagOf(language));
  const meta = date
    ? `<p class="site-meta"><span class="site-updated">${esc(t('site.updated', { date }))}</span><button type="button" class="site-print" data-site-print>${esc(t('site.print'))}</button></p>`
    : '';
  const note = fallback ? `<p class="site-fallback" role="note">${esc(t('site.fallback', { language: languageName(language) }))}</p>` : '';
  const toc = tocHtml(pageId, page, t, ctx);
  const contentLang = contentLanguage !== language ? ` lang="${esc(tagOf(contentLanguage))}"` : '';
  return `<article class="site-page" data-site-page="${esc(pageId)}">
    <header class="site-head">
      <div class="site-head-row">
        <p class="site-kicker">Trippy</p>
        <div class="site-head-language">${languageSwitchHtml({ current: language, where: 'page', t })}</div>
      </div>
      ${note}
      <div class="site-head-text"${contentLang}>
        <h1 class="site-title">${inlineHtml(page.title, ctx)}</h1>
        ${intro}
      </div>
      ${meta}
    </header>
    <div class="site-body${toc ? ' site-body--toc' : ''}">
      ${toc}
      <div class="site-content"${contentLang}>
        ${sectionsHtml(page, ctx)}
      </div>
    </div>
  </article>`;
}

/** What is shown when the page's content cannot be fetched. */
export function sitePageErrorHtml(t = translate) {
  return `<article class="site-page site-page--error">
    <header class="site-head">
      <h1 class="site-title">Trippy</h1>
      <p class="site-intro" role="alert">${esc(t('site.loadError'))}</p>
      <p><button type="button" class="btn btn--primary btn--pill" data-site-retry>${esc(t('site.retry'))}</button></p>
    </header>
  </article>`;
}

/**
 * The section the reader is in: the last one whose top has passed the offset; the first one before that.
 * @param {Array<{ id: string, top: number }>} sections tops relative to the window, in page order
 * @param {number} [offset]
 * @returns {string|null}
 */
export function activeSectionId(sections, offset = SPY_OFFSET_PX) {
  if (!Array.isArray(sections) || !sections.length) return null;
  const reached = sections.filter((section) => section.top <= offset);
  return (reached.length ? reached[reached.length - 1] : sections[0]).id;
}

// --- DOM --------------------------------------------------------------------------------------------

const openRoute = () => (location.hash.slice(1) || '/').split('?')[0];
const routePage = () => openRoute().split('/')[1] ?? '';

function goToSection(root, pageId, id, { focus = true } = {}) {
  const section = root.querySelector(`[data-site-section="${CSS.escape(id)}"]`);
  if (!section) return false;
  // The address names the section without a navigation: the router does not build the page again.
  history.replaceState(null, '', `#/${pageId}/${id}`);
  section.scrollIntoView({ block: 'start' });
  if (focus) section.querySelector('.site-section-title')?.focus({ preventScroll: true });
  return true;
}

function mountFrame(root, pageId) {
  const stop = new AbortController();
  const { signal } = stop;
  const sections = [...root.querySelectorAll('[data-site-section]')];
  const links = [...root.querySelectorAll('[data-site-jump]')];
  const box = root.querySelector('.site-toc-box');

  // The list is a column that stays open on a wide screen, and a closed disclosure on a phone.
  const wide = window.matchMedia(WIDE_QUERY);
  const fit = () => { if (box) box.open = wide.matches; };
  fit();
  wide.addEventListener('change', fit, { signal });

  let frame = 0;
  const mark = () => {
    frame = 0;
    const id = activeSectionId(sections.map((section) => ({ id: section.dataset.siteSection, top: section.getBoundingClientRect().top })));
    for (const link of links) {
      if (link.dataset.siteJump === id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  };
  if (links.length) {
    window.addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(mark); }, { passive: true, signal });
    mark();
  }

  // On paper every question shows its answer; the ones that were closed close again afterwards.
  let openedForPrint = [];
  window.addEventListener('beforeprint', () => {
    openedForPrint = [...root.querySelectorAll('.site-content details:not([open])')];
    for (const item of openedForPrint) item.open = true;
  }, { signal });
  window.addEventListener('afterprint', () => { for (const item of openedForPrint.splice(0)) item.open = false; }, { signal });

  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-site-print]')) { window.print(); return; }
    // A link to a section of this page, in the list or in the text: go there without a navigation.
    const link = target?.closest(`a[href^="#/${pageId}/"]`);
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const id = link.getAttribute('href').slice(`#/${pageId}/`.length);
    if (goToSection(root, pageId, id)) {
      event.preventDefault();
      if (box && !wide.matches) box.open = false;
      mark();
    }
  }, { signal });

  return () => { stop.abort(); if (frame) cancelAnimationFrame(frame); };
}

/**
 * Draws a site page into #app. Public: works signed in and signed out.
 * @param {string} pageId 'about' | 'privacy' | 'terms'
 * @param {{ section?: string|null }} [opts] a section to open at (#/privacy/<section>)
 */
export async function renderSitePage(pageId, { section = null } = {}) {
  const app = document.getElementById('app');
  if (!app || !isSitePage(pageId)) return;
  bindLanguageSwitches();
  let undo = [];
  const cleanup = () => { for (const fn of undo.splice(0)) { try { fn(); } catch { /* a cleanup must not stop the rest */ } } };
  let left = false;
  onRouteLeave(() => { left = true; cleanup(); });

  const draw = async (openAt) => {
    await languageReady();
    const language = getLanguage();
    let loaded = null;
    try { loaded = await loadSitePage(pageId, language); } catch { loaded = null; }
    if (left || routePage() !== pageId) return; // left while the content was loading
    cleanup();
    if (!loaded) {
      app.innerHTML = sitePageErrorHtml();
      app.querySelector('[data-site-retry]')?.addEventListener('click', () => { if (navigator.onLine) window.location.reload(); else draw(openAt); });
      return;
    }
    app.innerHTML = sitePageHtml({
      pageId, page: loaded.page, language, contentLanguage: loaded.language, fallback: loaded.fallback, updated: updatedOn(pageId),
    });
    const root = app.querySelector('.site-page');
    undo.push(mountFrame(root, pageId));
    if (loaded.mount) {
      try {
        const off = loaded.mount(root, { lang: loaded.language, t: tFor(language) });
        if (typeof off === 'function') undo.push(off);
      } catch { /* a page's extra behaviour must not take the text down with it */ }
    }
    // The page is drawn again in the new language, at the section the reader was in.
    undo.push(onLanguageChange(() => {
      const sections = drawableSections(loaded.page).map(({ id }) => ({ id, top: root.querySelector(`[data-site-section="${id}"]`)?.getBoundingClientRect().top ?? Infinity }));
      const at = window.scrollY > 0 ? activeSectionId(sections) : null;
      draw(at).then(() => restoreLanguageSwitchFocus('page'));
    }));
    if (openAt) goToSection(root, pageId, openAt, { focus: false });
  };
  await draw(section);
}
