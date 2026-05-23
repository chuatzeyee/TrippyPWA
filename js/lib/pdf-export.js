import { jsPDF } from 'jspdf';
import { getHomeCurrency } from '../data/user-prefs.js';
import { fetchAllPhotos } from './pdf/photos.js';
import { renderCover } from './pdf/cover-page.js';
import { renderLogisticsPage } from './pdf/logistics-page.js';
import { renderDayPages } from './pdf/day-page.js';
import { renderSummaryPage } from './pdf/summary-page.js';
import { drawAllFooters } from './pdf/layout.js';

export async function exportTripPdf(trip, { onProgress } = {}) {
  const days = trip.itinerary_days || [];
  days.sort((a, b) => a.day_number - b.day_number);

  onProgress?.('photos', 0);
  let photos;
  try {
    photos = await fetchAllPhotos(trip, onProgress);
  } catch {
    photos = { cover: null, activities: {} };
  }
  onProgress?.('render', 75);

  const homeCurrency = getHomeCurrency();

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const ctx = { y: 0, page: 1, accentColor: null };

  renderCover(doc, trip, photos, homeCurrency);

  renderLogisticsPage(doc, ctx, trip);

  onProgress?.('render', 85);

  renderDayPages(doc, ctx, trip, photos, homeCurrency);

  onProgress?.('render', 95);

  renderSummaryPage(doc, ctx, trip, homeCurrency);

  drawAllFooters(doc, ctx.page);

  onProgress?.('save', 98);

  const ws = trip.wizard_state;
  const dest = ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
  const tripTitle = dest?.name || trip.title || 'My Trip';
  const fileName = tripTitle.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-').toLowerCase();
  doc.save(`${fileName}-itinerary.pdf`);

  onProgress?.('save', 100);
}
