import { C, dayColor } from './colors.js';
import { PW, MX, MX_R, CW, fmtDate, fmtDateShort } from './layout.js';
import { convert } from '../../data/currencies.js';

export function renderCover(doc, trip, photos, homeCurrency) {
  const ws = trip.wizard_state;
  const dest = ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
  const sym = dest?.currencySymbol || '$';
  const code = dest?.currencyCode || 'USD';
  const days = trip.itinerary_days || [];
  const tripTitle = ws?.multiCity && ws?.destinations?.length > 0
    ? ws.destinations.map(d => d.name).join(' → ')
    : dest?.name || trip.title || 'My Trip';

  if (photos.cover) {
    doc.addImage(photos.cover, 'JPEG', 0, 0, PW, 130);
  } else {
    doc.setFillColor(...C.ink);
    doc.rect(0, 0, PW, 130, 'F');
  }

  if (trip.emoji) {
    doc.setFontSize(20);
    doc.setTextColor(...C.white);
    doc.text(trip.emoji, MX, 108);
  }

  doc.setFont('times', 'bold');
  doc.setFontSize(32);
  doc.setTextColor(...C.white);
  const titleLines = doc.splitTextToSize(tripTitle, CW);
  doc.text(titleLines, MX, 118);

  const meta = [];
  if (trip.start_date && trip.end_date) meta.push(`${fmtDate(trip.start_date)} - ${fmtDate(trip.end_date)}`);
  if (days.length) meta.push(`${days.length} days`);
  if (trip.travelers > 1) meta.push(`${trip.travelers} travelers`);

  if (meta.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(meta.join('  |  '), MX, 126);
  }

  let y = 140;

  let totalCost = 0;
  for (const d of days) {
    for (const a of d.activities || []) totalCost += a.cost_amount || 0;
  }

  doc.setFillColor(...C.white);
  doc.setDrawColor(...C.cardBorder);
  doc.setLineWidth(0.3);
  doc.roundedRect(MX, y, CW, 36, 3, 3, 'FD');

  const cardY = y + 8;
  const colW = CW / 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...C.inkGhost);
  doc.text('BUDGET', MX + 6, cardY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.ink);
  const budgetText = trip.budget_daily ? `${sym}${trip.budget_daily}/day` : 'Flexible';
  doc.text(budgetText, MX + 6, cardY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...C.inkGhost);
  doc.text('ACCOMMODATION', MX + 6, cardY + 14);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.ink);
  const accomType = ws?.accommodationType || ws?.accommodation || 'Hotel';
  doc.text(String(accomType).charAt(0).toUpperCase() + String(accomType).slice(1), MX + 6, cardY + 20);

  const rightX = MX + colW + 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...C.inkGhost);
  doc.text('ESTIMATED TOTAL', rightX, cardY);
  doc.setFont('courier', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...C.terracotta);
  let totalText = totalCost > 0 ? `${sym}${totalCost.toLocaleString()}` : 'TBD';
  doc.text(totalText, rightX, cardY + 7);

  if (totalCost > 0 && homeCurrency?.code && code && homeCurrency.code !== code) {
    const converted = convert(totalCost, code, homeCurrency.code);
    doc.setFont('courier', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C.inkGhost);
    doc.text(`~${homeCurrency.symbol}${converted.toLocaleString()}`, rightX, cardY + 13);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...C.inkGhost);
  doc.text('TRAVELERS', rightX, cardY + 19);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...C.ink);
  doc.text(`${trip.travelers || 1}`, rightX, cardY + 25);

  y += 44;

  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...C.ink);
  doc.text('Your Journey at a Glance', MX, y);
  y += 6;

  if (days.length === 0) return y + 6;

  const maxCols = days.length <= 7 ? days.length : 5;
  const rows = Math.ceil(days.length / maxCols);
  const gap = 2;
  const cellW = (CW - gap * (maxCols - 1)) / maxCols;
  const cellH = 26;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < maxCols; c++) {
      const idx = r * maxCols + c;
      if (idx >= days.length) break;
      const day = days[idx];
      const cx = MX + c * (cellW + gap);
      const cy = y + r * (cellH + gap);
      const color = dayColor(day.day_number);

      doc.setFillColor(...C.paper);
      doc.setDrawColor(...C.cardBorder);
      doc.setLineWidth(0.2);
      doc.roundedRect(cx, cy, cellW, cellH, 1.5, 1.5, 'FD');

      doc.setFillColor(...color);
      doc.rect(cx, cy + 1.5, 1.5, cellH - 3, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...color);
      doc.text(`Day ${day.day_number}`, cx + 4, cy + 5.5);

      if (day.date) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(...C.inkGhost);
        doc.text(fmtDateShort(day.date), cx + 4, cy + 9.5);
      }

      if (day.title) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(...C.inkSecondary);
        const titleTrunc = day.title.length > 22 ? day.title.slice(0, 20) + '..' : day.title;
        doc.text(titleTrunc, cx + 4, cy + 13.5);
      }

      const acts = day.activities || [];
      let dayCost = 0;
      for (const a of acts) dayCost += a.cost_amount || 0;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5);
      doc.setTextColor(...C.inkGhost);
      doc.text(`${acts.length} activities`, cx + 4, cy + 18);

      if (dayCost > 0) {
        doc.setFont('courier', 'bold');
        doc.setFontSize(6);
        doc.setTextColor(...C.ink);
        doc.text(`${sym}${dayCost.toLocaleString()}`, cx + 4, cy + 22);
      }
    }
  }

  return y + rows * (cellH + gap) + 6;
}
