import { jsPDF } from 'jspdf';

const COLORS = {
  parchment: [27, 26, 23],
  surface: [37, 35, 32],
  ink: [50, 48, 42],
  inkSecondary: [120, 115, 108],
  terracotta: [234, 88, 12],
  teal: [74, 150, 132],
  white: [255, 255, 255],
  border: [220, 216, 208],
};

function fmt(amount, symbol) {
  if (!amount || amount === 0) return 'Free';
  return `${symbol || '$'}${amount.toLocaleString()}`;
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDuration(min) {
  if (!min) return '';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export async function exportTripPdf(trip) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = 210;
  const ph = 297;
  const mx = 16;
  const mxR = pw - mx;
  const cw = mxR - mx;
  let y = 20;

  const ws = trip.wizard_state;
  const dest = ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
  const sym = dest?.currencySymbol || '$';
  const tripTitle = ws?.multiCity && ws?.destinations?.length > 0
    ? ws.destinations.map(d => d.name).join(' → ')
    : dest?.name || trip.title || 'My Trip';
  const days = trip.itinerary_days || [];
  days.sort((a, b) => a.day_number - b.day_number);

  function ensureSpace(needed) {
    if (y + needed > ph - 20) {
      doc.addPage();
      y = 20;
    }
  }

  doc.setFillColor(...COLORS.terracotta);
  doc.rect(0, 0, pw, 44, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...COLORS.white);
  doc.text(tripTitle, mx, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  const meta = [];
  if (trip.start_date && trip.end_date) meta.push(`${fmtDate(trip.start_date)} - ${fmtDate(trip.end_date)}`);
  if (days.length) meta.push(`${days.length} days`);
  if (trip.travelers > 1) meta.push(`${trip.travelers} travelers`);
  if (meta.length) doc.text(meta.join('  |  '), mx, 27);

  let totalCost = 0;
  for (const d of days) {
    for (const a of d.activities || []) totalCost += a.cost_amount || 0;
  }
  if (totalCost > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total: ${fmt(totalCost, sym)}`, mx, 38);
  }

  y = 52;

  for (const day of days) {
    const acts = day.activities || [];
    acts.sort((a, b) => {
      if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    ensureSpace(20);

    doc.setFillColor(...COLORS.parchment);
    doc.roundedRect(mx, y, cw, 10, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.white);
    const dayLabel = `Day ${day.day_number}`;
    doc.text(dayLabel, mx + 4, y + 7);

    const dayTitle = day.title || '';
    if (dayTitle) {
      const labelW = doc.getTextWidth(dayLabel);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`- ${dayTitle}`, mx + 4 + labelW + 3, y + 7);
    }

    if (day.date) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.inkSecondary);
      const dateStr = fmtDate(day.date);
      doc.text(dateStr, mxR - 4, y + 7, { align: 'right' });
    }

    y += 14;

    for (const act of acts) {
      const lines = doc.splitTextToSize(act.description || '', cw - 40);
      const actH = 8 + (lines.length > 0 ? lines.length * 3.5 : 0) + (act.venue_name ? 4 : 0);
      ensureSpace(actH + 2);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLORS.ink);

      const time = act.start_time || '';
      if (time) {
        doc.setTextColor(...COLORS.terracotta);
        doc.text(time, mx + 2, y);
        doc.setTextColor(...COLORS.ink);
      }

      const titleX = mx + (time ? 22 : 2);
      doc.text(act.title || '', titleX, y);

      const noCostCats = new Set(['departure', 'arrival', 'flight', 'check-in', 'landing', 'transfer']);
      const actCat = (act.category || '').toLowerCase();
      const rightParts = [];
      if (act.duration_minutes) rightParts.push(fmtDuration(act.duration_minutes));
      if (!(noCostCats.has(actCat) && !act.cost_amount)) rightParts.push(fmt(act.cost_amount, sym));
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.inkSecondary);
      doc.text(rightParts.join(' | '), mxR - 2, y, { align: 'right' });

      y += 4;

      if (act.venue_name) {
        doc.setFontSize(7.5);
        doc.setTextColor(...COLORS.teal);
        doc.text(act.venue_name, titleX, y);
        y += 3.5;
      }

      if (act.description) {
        doc.setFontSize(7.5);
        doc.setTextColor(...COLORS.inkSecondary);
        doc.text(lines, titleX, y);
        y += lines.length * 3.5;
      }

      y += 2;
    }

    doc.setDrawColor(...COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(mx, y, mxR, y);
    y += 6;
  }

  ensureSpace(10);
  doc.setFontSize(7);
  doc.setTextColor(...COLORS.inkSecondary);
  doc.text('Generated by Trippy', mx, y);
  doc.text(new Date().toLocaleDateString('en-GB'), mxR - 2, y, { align: 'right' });

  const fileName = tripTitle.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-').toLowerCase();
  doc.save(`${fileName}-itinerary.pdf`);
}
