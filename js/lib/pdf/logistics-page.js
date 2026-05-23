import { C } from './colors.js';
import { PW, MX, MX_R, CW, BOTTOM, ensureSpace, drawPageAccent } from './layout.js';

const MODE_LABELS = { ferry: 'Ferry', bus: 'Bus', train: 'Rail', drive: 'Drive' };

function drawRouteVisualization(doc, from, to, y, isTransport, mode) {
  const centerX = MX + CW / 2;
  const codeSpacing = 50;

  doc.setFont('courier', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...C.ink);
  doc.text(from, centerX - codeSpacing, y, { align: 'center' });
  doc.text(to, centerX + codeSpacing, y, { align: 'center' });

  const lineY = y - 2;
  const lineStart = centerX - codeSpacing + 18;
  const lineEnd = centerX + codeSpacing - 18;
  doc.setDrawColor(...C.cardBorder);
  doc.setLineWidth(0.5);
  doc.setLineDashPattern([1.5, 1.5]);
  doc.line(lineStart, lineY, lineEnd, lineY);
  doc.setLineDashPattern([]);

  const midX = (lineStart + lineEnd) / 2;
  doc.setFillColor(...C.terracotta);
  if (isTransport) {
    doc.circle(midX, lineY, 2, 'F');
    const icon = (mode === 'bus') ? 'B' : (mode === 'train') ? 'T' : (mode === 'ferry') ? 'F' : 'D';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5);
    doc.setTextColor(...C.white);
    doc.text(icon, midX, lineY + 0.8, { align: 'center' });
  } else {
    doc.triangle(midX - 2, lineY + 1.5, midX - 2, lineY - 1.5, midX + 2.5, lineY, 'F');
  }
}

function renderFlightOrTransport(doc, ctx, extras) {
  const isTransport = !!extras?.transport;
  const data = isTransport ? extras.transport : extras?.flights;
  if (!data) return;

  const mode = isTransport
    ? (data.outbound?.mode || data.inbound?.mode || 'bus')
    : null;

  const title = isTransport ? (MODE_LABELS[mode] || 'Transport') : 'Flights';

  ensureSpace(doc, ctx, 70);

  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...C.terracotta);
  doc.text(title, MX, ctx.y);
  ctx.y += 8;

  const renderLeg = (leg, label) => {
    if (!leg) return;
    ensureSpace(doc, ctx, 30);

    doc.setFillColor(...C.white);
    doc.setDrawColor(...C.cardBorder);
    doc.setLineWidth(0.3);
    doc.roundedRect(MX, ctx.y, CW, 28, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.inkGhost);
    doc.text(label.toUpperCase(), MX + 6, ctx.y + 5);

    const routeParts = (leg.route || '').split(/\s*(?:[→➔>]|\bto\b)\s*/i);
    const from = routeParts[0] || '???';
    const to = routeParts.length > 1 ? routeParts[routeParts.length - 1] : '???';
    drawRouteVisualization(doc, from, to, ctx.y + 15, isTransport, mode);

    if (leg.duration) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...C.inkSecondary);
      doc.text(leg.duration, MX + CW / 2, ctx.y + 20, { align: 'center' });
    }

    const airline = isTransport ? (leg.operator || '') : (leg.airline || '');
    if (airline) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...C.ink);
      doc.text(airline, MX + 6, ctx.y + 25);
    }

    if (leg.priceRange) {
      doc.setFont('courier', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...C.terracotta);
      doc.text(leg.priceRange, MX_R - 6, ctx.y + 25, { align: 'right' });
    }

    ctx.y += 34;
  };

  renderLeg(data.outbound, 'Outbound');
  renderLeg(data.inbound, 'Return');
  ctx.y += 4;
}

function renderAccommodation(doc, ctx, extras) {
  const accom = extras?.accommodation;
  if (!Array.isArray(accom) || accom.length === 0) return;

  ensureSpace(doc, ctx, 40);

  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...C.terracotta);
  doc.text('Where to Stay', MX, ctx.y);
  ctx.y += 8;

  const colW = (CW - 8) / 2;
  const BADGE_COLORS = {
    'Recommended': C.terracotta,
    'Best Value': C.teal,
    'Best Location': C.teal,
    'Luxury Pick': [182, 141, 64]
  };

  for (let i = 0; i < accom.length; i += 2) {
    const rowItems = accom.slice(i, i + 2);
    let maxH = 0;

    const cardHeights = rowItems.map(a => {
      const highlights = (a.highlights || '').split(/[.,;]\s*/).filter(s => s.trim().length > 2);
      return 28 + Math.min(highlights.length, 3) * 4;
    });
    maxH = Math.max(...cardHeights);

    ensureSpace(doc, ctx, maxH + 4);

    for (let j = 0; j < rowItems.length; j++) {
      const a = rowItems[j];
      const cx = j === 0 ? MX : MX + colW + 8;
      const cardH = cardHeights[j];

      doc.setFillColor(...C.tealLight);
      doc.setDrawColor(...C.cardBorder);
      doc.setLineWidth(0.2);
      doc.roundedRect(cx, ctx.y, colW, maxH, 2, 2, 'FD');

      if (a.badge) {
        const badgeColor = BADGE_COLORS[a.badge] || C.terracotta;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.5);
        const badgeW = doc.getTextWidth(a.badge) + 6;
        doc.setFillColor(...badgeColor);
        doc.roundedRect(cx + colW - badgeW - 3, ctx.y + 2, badgeW, 5, 2.5, 2.5, 'F');
        doc.setTextColor(...C.white);
        doc.text(a.badge, cx + colW - 3 - badgeW / 2, ctx.y + 5.5, { align: 'center' });
      }

      doc.setFont('times', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...C.ink);
      const nameLines = doc.splitTextToSize(a.name || '', colW - 8);
      doc.text(nameLines[0] || '', cx + 4, ctx.y + 9);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...C.inkSecondary);
      doc.text(`${a.area || ''} · ${a.type || ''}`, cx + 4, ctx.y + 14);

      if (a.priceRange) {
        doc.setFont('courier', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...C.ink);
        doc.text(a.priceRange, cx + 4, ctx.y + 20);
      }

      const highlights = (a.highlights || '').split(/[.,;]\s*/).filter(s => s.trim().length > 2);
      for (let h = 0; h < Math.min(highlights.length, 3); h++) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...C.inkSecondary);
        doc.text(`· ${highlights[h]}`, cx + 4, ctx.y + 25 + h * 4);
      }
    }

    ctx.y += maxH + 6;
  }
  ctx.y += 4;
}

function renderChecklist(doc, ctx, extras) {
  const groups = extras?.bookingChecklist;
  if (!Array.isArray(groups) || groups.length === 0) return;

  ensureSpace(doc, ctx, 30);

  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...C.terracotta);
  doc.text('Before You Go', MX, ctx.y);
  ctx.y += 8;

  for (const group of groups) {
    ensureSpace(doc, ctx, 14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C.ink);
    doc.text(group.group || '', MX, ctx.y);
    ctx.y += 5;

    for (const item of (group.items || [])) {
      ensureSpace(doc, ctx, 6);
      doc.setDrawColor(...C.cardBorder);
      doc.setLineWidth(0.3);
      doc.rect(MX + 2, ctx.y - 2.5, 3, 3);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.inkSecondary);
      const label = item.label || '';
      const note = item.day ? ` (Day ${item.day})` : '';
      doc.text(`${label}${note}`, MX + 8, ctx.y);
      ctx.y += 5;
    }
    ctx.y += 2;
  }
}

export function renderLogisticsPage(doc, ctx, trip) {
  const hasLogistics = trip.extras?.flights || trip.extras?.transport
    || (Array.isArray(trip.extras?.accommodation) && trip.extras.accommodation.length > 0)
    || (Array.isArray(trip.extras?.bookingChecklist) && trip.extras.bookingChecklist.length > 0);

  if (!hasLogistics) return;

  doc.addPage();
  ctx.page++;
  ctx.y = 14;
  ctx.accentColor = C.terracotta;
  drawPageAccent(doc, C.terracotta);

  renderFlightOrTransport(doc, ctx, trip.extras);
  renderAccommodation(doc, ctx, trip.extras);
  renderChecklist(doc, ctx, trip.extras);
}
