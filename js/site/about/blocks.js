// The About page's own blocks, as markup for a { type: 'custom' } block: the plan sketch with its
// controls, the steps of how a plan is made, the two lists of what Trippy does and does not do, the
// three views behind a switch, and the square layout. Pure: words in, a string out, every word
// escaped (the body texts take the same **strong** and [label](target) as the rest of a site page).
// Each builder takes its words, so a translation of the page passes its own. The look is
// css/components/site-about.css; what needs a script is in js/site/about/mount.js.
import { inlineHtml } from '../content.js';
import { DEFAULT_DAYS, MAX_DAYS, MIN_DAYS, SKETCH_PLACES, SKETCH_WORDS, clampDays, sketchHtml, sketchPlan } from './plan-sketch.js';

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
const lines = (value) => (Array.isArray(value) ? value : [value]).filter((line) => typeof line === 'string' && line.trim());
const paragraphs = (value) => lines(value).map((line) => `<p>${inlineHtml(line)}</p>`).join('');

/** The views, in the order of the app's own picker, and the one a new account starts on. */
export const ABOUT_VIEWS = Object.freeze(['atlas', 'departures', 'concierge']);
export const ABOUT_DEFAULT_VIEW = 'atlas';

/** Where the public images are: the site's base address, with its closing slash. */
export function publicBase(baseUrl) {
  const base = typeof baseUrl === 'string' && /^\/(?!\/)/.test(baseUrl) ? baseUrl : '/';
  return base.endsWith('/') ? base : `${base}/`;
}

/** One choice of a segmented control: a radio the keyboard already knows how to walk. */
const option = (name, value, label, checked) => `<label class="about-seg-opt"><input type="radio" class="about-seg-input" name="${esc(name)}" value="${esc(value)}"${checked ? ' checked' : ''}><span class="about-seg-label">${esc(label)}</span></label>`;

/** An image in both themes: the stylesheet shows the one that matches, and only that one is fetched. */
const themedImage = (src, { alt, width, height }) => ['dark', 'light']
  .map((theme) => `<img class="about-img about-img--${theme}" src="${esc(src(theme))}" alt="${esc(alt)}" width="${width}" height="${height}" loading="lazy" decoding="async">`).join('');

/**
 * The plan sketch: two radio groups and the plan they choose. The plan for the first place is in the
 * markup, so it reads without a script; the controls stay hidden until mount.js has bound them.
 * @param {{ legendPlace: string, legendDays: string, daysOption: string, note: string }} words daysOption holds {n}
 * @param {{ places?: typeof SKETCH_PLACES, sketchWords?: typeof SKETCH_WORDS }} [data]
 */
export function demoHtml(words, { places = SKETCH_PLACES, sketchWords = SKETCH_WORDS } = {}) {
  const first = places[0].id;
  const dayOptions = [];
  for (let n = MIN_DAYS; n <= MAX_DAYS; n += 1) dayOptions.push(option('about-days', n, words.daysOption.replace('{n}', n), n === clampDays(DEFAULT_DAYS)));
  return `<div class="about-demo" data-about-demo>
    <form class="about-demo-controls" data-about-controls hidden>
      <fieldset class="about-seg"><legend class="about-seg-legend">${esc(words.legendPlace)}</legend><div class="about-seg-track">${places.map((place) => option('about-place', place.id, place.name, place.id === first)).join('')}</div></fieldset>
      <fieldset class="about-seg"><legend class="about-seg-legend">${esc(words.legendDays)}</legend><div class="about-seg-track">${dayOptions.join('')}</div></fieldset>
    </form>
    <div class="about-sketch" data-about-sketch aria-live="polite">${sketchHtml(sketchPlan({ place: first, days: DEFAULT_DAYS }, places), sketchWords)}</div>
    <p class="about-demo-note">${inlineHtml(words.note)}</p>
  </div>`;
}

/**
 * How a plan is made: an ordered list of steps, each a native disclosure (the first one open). With a
 * script every step also gets a button to the next one, and the list a button that opens them all.
 * @param {{ openAll: string, closeAll: string, next: string, steps: Array<{ title: string, summary: string, body: string|string[] }> }} words next holds {title}
 */
export function stepsHtml(words) {
  const steps = words.steps.map((step, index) => {
    const following = words.steps[index + 1];
    const next = following ? `<p class="about-step-more"><button type="button" class="about-btn" data-about-next hidden>${esc(words.next.replace('{title}', following.title))}</button></p>` : '';
    return `<li class="about-step">
      <details class="about-step-box" data-about-step${index === 0 ? ' open' : ''}>
        <summary class="about-step-head"><span class="about-step-n" aria-hidden="true">${index + 1}</span><span class="about-step-text"><span class="about-step-title">${esc(step.title)}</span><span class="about-step-summary">${esc(step.summary)}</span></span></summary>
        <div class="about-step-body">${paragraphs(step.body)}${next}</div>
      </details>
    </li>`;
  }).join('');
  return `<div class="about-steps-wrap" data-about-steps>
    <p class="about-steps-tools"><button type="button" class="about-btn" data-about-all data-open-text="${esc(words.openAll)}" data-close-text="${esc(words.closeAll)}" aria-expanded="false" hidden>${esc(words.openAll)}</button></p>
    <ol class="about-steps">${steps}</ol>
  </div>`;
}

const TICK = '<svg class="about-mark" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CROSS = '<svg class="about-mark" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/**
 * Two panels that end on the same line: what Trippy does, and what it does not do.
 * @param {{ does: { title: string, items: string[] }, doesNot: { title: string, items: string[] } }} words
 */
export function limitsHtml(words) {
  const panel = (side, mark, kind) => `<section class="about-panel about-panel--${kind}">
      <h3 class="about-panel-title">${esc(side.title)}</h3>
      <ul class="about-panel-list">${side.items.map((item) => `<li>${mark}<span>${inlineHtml(item)}</span></li>`).join('')}</ul>
    </section>`;
  return `<div class="about-panels">${panel(words.does, TICK, 'does')}${panel(words.doesNot, CROSS, 'not')}</div>`;
}

/**
 * The three views behind a switch that needs no script: three radios, and the stylesheet shows the
 * panel of the checked one. Where the browser cannot do that, and on paper, all three are shown.
 * @param {{ legend: string, isDefault: string, alt: string, views: Object<string, { name: string, text: string|string[] }> }} words alt holds {view}
 * @param {{ baseUrl?: string }} [opts]
 */
export function viewsHtml(words, { baseUrl = '/' } = {}) {
  const base = publicBase(baseUrl);
  const ids = ABOUT_VIEWS.filter((id) => words.views[id]);
  const panels = ids.map((id) => {
    const view = words.views[id];
    return `<figure class="about-view" data-about-view="${id}">
      <div class="about-view-shot">${themedImage((theme) => `${base}img/views/${id}-${theme}.webp`, { alt: words.alt.replace('{view}', view.name), width: 720, height: 900 })}</div>
      <figcaption class="about-view-text">
        <h3 class="about-view-name">${esc(view.name)}${id === ABOUT_DEFAULT_VIEW ? ` <span class="about-tag">${esc(words.isDefault)}</span>` : ''}</h3>
        ${paragraphs(view.text)}
      </figcaption>
    </figure>`;
  }).join('');
  return `<div class="about-views" data-about-views>
    <fieldset class="about-seg"><legend class="about-seg-legend">${esc(words.legend)}</legend><div class="about-seg-track">${ids.map((id) => option('about-view', id, words.views[id].name, id === ABOUT_DEFAULT_VIEW)).join('')}</div></fieldset>
    <div class="about-view-panels">${panels}</div>
  </div>`;
}

/**
 * The square layout: a picture of it beside the words.
 * @param {{ alt: string, text: string|string[], credit: string }} words
 * @param {{ baseUrl?: string }} [opts]
 */
export function squareHtml(words, { baseUrl = '/' } = {}) {
  const base = publicBase(baseUrl);
  return `<figure class="about-square">
    <div class="about-square-shot">${themedImage((theme) => `${base}img/about/square-${theme}.webp`, { alt: words.alt, width: 832, height: 832 })}</div>
    <figcaption class="about-square-text">${paragraphs(words.text)}<p class="about-credit">${inlineHtml(words.credit)}</p></figcaption>
  </figure>`;
}
