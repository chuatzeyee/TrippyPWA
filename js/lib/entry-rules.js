// The rules behind the "Entry requirements" card that other modules need too:
// the wording of a visa status and of a filing window, how rows for several
// passports merge, the dates of a filing window, and the keys under which
// ticks are stored on the device. Pure: no DOM, no network, no storage.
//
// Moved here from js/components/entry-card.js and js/services/entry-advisor.js,
// which re-export what they used to define.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const shortDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1]}` : '';
};

/** One line on the visa status for a passport. */
export function visaLine(visa) {
  if (!visa) return '';
  if (visa.code === 'vf') return visa.stayDays ? `Visa-free, up to ${visa.stayDays} days` : 'Visa-free';
  if (visa.code === 'voa') return 'Visa on arrival';
  if (visa.code === 'eta') return 'Travel authorisation needed before you fly';
  if (visa.code === 'ev') return 'eVisa needed before you travel';
  if (visa.code === 'vr') return 'Visa needed. Apply at an embassy or consulate well ahead';
  if (visa.code === 'na') return 'Entry is restricted for this passport';
  return visa.label || '';
}

/** "Do it between 10 Jan and 12 Jan" style timing for an item with dates. */
export function timingLine(item) {
  const { from, by } = item.dates || {};
  if (from && by && from === by) return `Do it on ${shortDate(from)}, it can't be done earlier`;
  if (from && by) return `Do it between ${shortDate(from)} and ${shortDate(by)}`;
  if (from) return `Opens ${shortDate(from)}, do it before you arrive`;
  if (by) return `Do it by ${shortDate(by)}`;
  return '';
}

/**
 * Rows with the same visa status and the same paperwork become one row naming
 * every passport it covers.
 */
export function mergeRows(rows) {
  const groups = [];
  for (const row of rows) {
    const sig = `${row.visa?.code || ''}|${row.visa?.stayDays || ''}|${row.items.map(i => i.id).join(',')}`;
    const same = groups.find(g => g.sig === sig);
    if (same) same.passports.push(row.passport);
    else groups.push({ sig, ...row, passports: [row.passport] });
  }
  return groups;
}

/** Date arithmetic on YYYY-MM-DD strings, calendar-safe. */
export function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** { from, by } dates for an item before arriving on `arriveDate`. */
export function itemDates(item, arriveDate) {
  if (!arriveDate) return { from: null, by: null };
  const from = Number.isInteger(item.windowDays) ? addDays(arriveDate, -item.windowDays) : null;
  const by = Number.isInteger(item.leadDays) ? addDays(arriveDate, -item.leadDays) : null;
  return { from, by: by && from && by < from ? from : by };
}

/**
 * Where the tick of one item is kept in the device's `entry-done-<tripId>`
 * store: tripId:iso2:PASSPORT+PASSPORT:itemId. `passports` are those of the
 * merged row (mergeRows), in its order. The format is already on devices: do
 * not change it.
 */
export function entryDoneKey(tripId, iso2, passports, itemId) {
  return `${tripId}:${iso2}:${passports.join('+')}:${itemId}`;
}

/**
 * Where the "I have this" tick of one row is kept, in the same
 * `entry-done-<tripId>` store as the item ticks. Item ids always carry a
 * country prefix ("au-eta"), so the last part never meets one.
 */
export function entryHaveKey(tripId, iso2, passports) {
  return entryDoneKey(tripId, iso2, passports, 'have');
}

/**
 * Whether a row (one passport, or a merged group) needs the "I have this"
 * tick: its visa line asks for something and the row offers no required item
 * to tick for it. That is a visa from an embassy (`vr`), or a travel
 * authorisation or eVisa (`eta`, `ev`) with no required item of that kind.
 * Restricted entry (`na`) is not something a tick can settle.
 */
export function needsHaveTick(row) {
  const code = row?.visa?.code;
  if (code === 'vr') return true;
  // The item kind that settles this status once it is ticked.
  const kind = code === 'eta' ? 'eta' : code === 'ev' ? 'evisa' : null;
  if (!kind) return false;
  return !(row.items || []).some(item => item.required && item.kind === kind);
}
