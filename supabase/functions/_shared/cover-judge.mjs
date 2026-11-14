// Trip cover photo: the optional vision check (pure half). The top heuristic
// candidates are shown to a vision model (Gemini) as 500px previews; its
// verdicts can only REMOVE candidates or REORDER them, never add one, so the
// relevance gates in cover-rank.mjs still decide what may be a cover. Any
// failure (no key, timeout, bad JSON) keeps the heuristic order.
import { wikiThumbUrl } from "./cover-rank.mjs";

const JUDGE_MAX = 6;
const JUDGE_PER_SOURCE = 4;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Up to six candidates for the vision check, at most four from one source. */
export function judgeSet(ranked) {
  const out = [];
  const per = { pexels: 0, wikimedia: 0 };
  for (const c of ranked || []) {
    const fam = c.source === "pexels" ? "pexels" : "wikimedia";
    if (per[fam] >= JUDGE_PER_SOURCE) continue;
    per[fam]++;
    out.push(c);
    if (out.length >= JUDGE_MAX) break;
  }
  return out;
}

/** A 500px preview for the vision check. */
export function judgeThumbUrl(c) {
  if (c?.source === "pexels") return `${c.original}?auto=compress&cs=tinysrgb&w=500`;
  return wikiThumbUrl(c, 500);
}

export const JUDGE_SCHEMA = {
  type: "OBJECT",
  properties: {
    images: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          index: { type: "INTEGER" },
          showsDestination: { type: "STRING", enum: ["yes", "no", "unsure"] },
          beauty: { type: "INTEGER" },
          focusY: { type: "INTEGER" },
        },
        required: ["index", "showsDestination", "beauty", "focusY"],
      },
    },
  },
  required: ["images"],
};

/** The instruction sent with the numbered previews. */
export function judgePrompt(ctx, count) {
  const month = MONTHS[(ctx?.month || 0) - 1];
  const when = month ? `${month}${ctx.season && ctx.season !== "none" ? ` (${ctx.season})` : ""}` : "an unknown month";
  return [
    `You are choosing the cover photo for a trip to ${ctx?.name || "a city"}${ctx?.country ? `, ${ctx.country}` : ""}, travelling in ${when}.`,
    `There are ${count} numbered images (0 to ${count - 1}). The cover shows as a very wide strip: about 10:1 on desktop and 2.5:1 on phones,`,
    "with a dark gradient over the bottom 70% and the white city name at the bottom left.",
    "For each image answer: showsDestination (yes, no or unsure: is this recognisably this destination, not another city, a generic scene, a sign or an interior),",
    "beauty (1 to 10: how attractive the image will look cropped to that strip; penalise clutter, people as the subject, haze, plain sky, text and very dark images),",
    "and focusY (0 to 100: the vertical position, from the top, of the band that should stay visible in the strip).",
    "Return JSON only, one entry per image.",
  ].join(" ");
}

/**
 * Parse the model's JSON reply into verdicts by index; null when unusable.
 * @returns {Map<number, { showsDestination: string, beauty: number, focusY: number }> | null}
 */
export function parseJudgeReply(text, count) {
  let data;
  try { data = JSON.parse(String(text ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "")); } catch { return null; }
  const list = Array.isArray(data) ? data : data?.images;
  if (!Array.isArray(list)) return null;
  const out = new Map();
  for (const v of list) {
    const i = Number(v?.index), beauty = Number(v?.beauty), focusY = Number(v?.focusY);
    if (!Number.isInteger(i) || i < 0 || i >= count || out.has(i)) continue;
    if (!["yes", "no", "unsure"].includes(v?.showsDestination) || !Number.isFinite(beauty)) continue;
    out.set(i, { showsDestination: v.showsDestination, beauty: clamp(beauty, 1, 10), focusY: Number.isFinite(focusY) ? clamp(focusY, 0, 100) : null });
  }
  return out.size ? out : null;
}

/**
 * Apply the vision verdicts: drop "no" and beauty < 5, order the rest by
 * 10 x beauty + 0.3 x heuristic score. Images without a verdict keep their
 * heuristic order after the judged ones. Never adds a candidate.
 * @param {object[]} ranked heuristic order
 * @param {object[]} judged the candidates sent, in prompt order
 * @param {Map<number, object> | null} verdicts
 */
export function applyJudge(ranked, judged, verdicts) {
  if (!verdicts || !verdicts.size) return ranked;
  const byKey = new Map();
  judged.forEach((c, i) => { if (verdicts.has(i)) byKey.set(c.key, verdicts.get(i)); });
  const kept = [];
  const rest = [];
  for (const c of ranked) {
    const v = byKey.get(c.key);
    if (!v) { rest.push(c); continue; }
    if (v.showsDestination === "no" || v.beauty < 5) continue;
    kept.push({ ...c, judge: { beauty: v.beauty, showsDestination: v.showsDestination }, judgeFocusY: v.focusY ?? undefined, final: 10 * v.beauty + 0.3 * c.score });
  }
  kept.sort((a, b) => b.final - a.final);
  return [...kept, ...rest];
}
