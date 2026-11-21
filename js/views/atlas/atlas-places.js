// Which places the Atlas page can show. Kept apart from the stage so the view's entry chunk can tell
// an empty atlas from a drawn one without loading the stage (ruling R40). Owner: VC.
import { groupPlaces } from '../shared/world-map.js';

/**
 * Every step of the place card, in order: one entry per plan of each place, most current place
 * first; home, when no plan is there, is one entry of its own at the end.
 * @param {import('../contract.js').DashboardModel} model
 * @returns {Array<{ key: string, tripId: string|null, plan: number, of: number }>}
 */
export function placeEntries(model) {
  const cards = model?.cardsById ?? {};
  return groupPlaces(model?.pins).flatMap((group) => {
    const ids = group.tripIds.filter((id) => Object.hasOwn(cards, id));
    if (!ids.length) return group.home ? [{ key: group.key, tripId: null, plan: 0, of: 0 }] : [];
    return ids.map((tripId, plan) => ({ key: group.key, tripId, plan, of: ids.length }));
  });
}
