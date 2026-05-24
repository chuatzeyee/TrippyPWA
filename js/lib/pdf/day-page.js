import { C, dayColor, categoryBadge } from './colors.js';
import { PW, PH, MX, MX_R, CW, BOTTOM, ensureSpace, drawPageAccent, fmtDateShort, fmtDuration } from './layout.js';
import { convert } from '../../data/currencies.js';

const NO_COST_CATS = new Set(['departure', 'arrival', 'flight', 'check-in', 'landing', 'transfer', 'check-out']);
const TIMELINE_X = 26;
const CARD_X = 32;
const CARD_W = MX_R - CARD_X;

function drawDayHeader(doc, ctx, day, color) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...C.inkGhost);
  doc.text('Day', MX, ctx.y);

  doc.setFont('times', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(...color);
  doc.text(`${day.day_number}`, MX, ctx.y + 11);

  const textX = MX + 20;
  if (day.title) {
    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...C.ink);
    const titleLines = doc.splitTextToSize(day.title, CW - 24);
    doc.text(titleLines[0] || '', textX, ctx.y + 2);
  }

  if (day.date) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.inkGhost);
    let weatherStr = '';
    if (day.weather) {
      if (typeof day.weather === 'string') weatherStr = ` · ${day.weather}`;
      else if (day.weather.highC != null) weatherStr = ` · ${day.weather.lowC || ''}–${day.weather.highC}° ${day.weather.condition || ''}`.trim();
      else if (day.weather.condition) weatherStr = ` · ${day.weather.condition}`;
    }
    doc.text(`${fmtDateShort(day.date)}${weatherStr}`, textX, ctx.y + 8);
  }

  if (day.theme) {
    doc.setFillColor(...color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    const themeW = doc.getTextWidth(day.theme) + 6;
    doc.roundedRect(textX, ctx.y + 10, themeW, 4.5, 2, 2, 'F');
    doc.setTextColor(...C.white);
    doc.text(day.theme, textX + themeW / 2, ctx.y + 13.2, { align: 'center' });
  }

  ctx.y += 20;
}

function drawActivityCard(doc, ctx, act, color, photoData, destSym, destCode, homeCurrency) {
  const hasPhoto = !!photoData;
  const PAD = 5;
  const PHOTO_W = 32;
  const PHOTO_H = 22;
  const PHOTO_GAP = 3;
  const LH = { title: 3.8, venue: 3.0, desc: 2.9, small: 2.7 };
  const S = 1.2;
  const narrowW = hasPhoto ? CARD_W - PHOTO_W - PHOTO_GAP - PAD * 2 : CARD_W - PAD * 2;
  const fullW = CARD_W - PAD * 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  const titleLines = doc.splitTextToSize(act.title || '', narrowW - 2).slice(0, 2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const venueLines = act.venue_name
    ? doc.splitTextToSize(act.venue_name, narrowW - 2).slice(0, 2) : [];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  const descLines = act.description
    ? doc.splitTextToSize(act.description, narrowW).slice(0, hasPhoto ? 3 : 5) : [];

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6);
  const tipLines = act.tips
    ? doc.splitTextToSize(`Tip: ${act.tips}`, fullW).slice(0, 2) : [];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  const transportStr = act.getting_there || (act.transport_mode ? `${act.transport_mode || ''} ${act.transport_duration || ''}`.trim() : '');
  const transportLines = transportStr
    ? doc.splitTextToSize(transportStr, fullW).slice(0, 2) : [];

  const cat = (act.category || '').toLowerCase();
  const showCost = !!(act.cost_amount || !NO_COST_CATS.has(cat));

  let cardH = 4;
  cardH += titleLines.length * LH.title + S;
  if (venueLines.length) cardH += venueLines.length * LH.venue + S;
  if (descLines.length) cardH += descLines.length * LH.desc + S;
  if (showCost) cardH += 4.5;
  if (tipLines.length) cardH += tipLines.length * LH.small + S;
  if (transportLines.length) cardH += transportLines.length * LH.small + S;
  cardH += PAD;
  cardH = Math.max(cardH, hasPhoto ? PHOTO_H + PAD * 2 : 22);

  if (ctx.y + cardH + 6 > BOTTOM) {
    doc.addPage();
    ctx.page++;
    ctx.y = 14;
    drawPageAccent(doc, color);
  }

  doc.setFillColor(...color);
  doc.circle(TIMELINE_X, ctx.y + 3, 1.5, 'F');

  if (act.start_time) {
    doc.setFont('courier', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.terracotta);
    doc.text(act.start_time, TIMELINE_X - 3, ctx.y + 4, { align: 'right' });
  }

  doc.setFillColor(...C.white);
  doc.setDrawColor(...C.cardBorder);
  doc.setLineWidth(0.25);
  doc.roundedRect(CARD_X, ctx.y, CARD_W, cardH, 2, 2, 'FD');

  const badge = categoryBadge(act.category);
  doc.setFillColor(...badge.color);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5);
  const badgeW = doc.getTextWidth(badge.label) + 3.5;
  doc.roundedRect(CARD_X + PAD, ctx.y + PAD - 2, badgeW, 3.5, 1.5, 1.5, 'F');
  doc.setTextColor(...C.white);
  doc.text(badge.label, CARD_X + PAD + badgeW / 2, ctx.y + PAD + 0.3, { align: 'center' });

  if (hasPhoto) {
    try {
      doc.addImage(photoData, 'JPEG', CARD_X + CARD_W - PHOTO_W - PAD + 1, ctx.y + PAD, PHOTO_W, PHOTO_H);
    } catch { /* photo render failed */ }
  }

  let ty = ctx.y + 9;
  const textX = CARD_X + PAD;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...C.ink);
  doc.text(titleLines, textX, ty);
  ty += titleLines.length * LH.title + S;

  if (venueLines.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.teal);
    doc.text(venueLines, textX, ty);
    ty += venueLines.length * LH.venue + S;
  }

  if (descLines.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.inkSecondary);
    doc.text(descLines, textX, ty);
    ty += descLines.length * LH.desc + S;
  }

  if (showCost) {
    if (act.cost_amount && act.cost_amount > 0) {
      doc.setFont('courier', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.ink);
      const costText = `${destSym}${act.cost_amount.toLocaleString()}`;
      doc.text(costText, textX, ty);

      if (homeCurrency?.code && destCode && homeCurrency.code !== destCode) {
        const converted = convert(act.cost_amount, destCode, homeCurrency.code);
        doc.setFont('courier', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(...C.inkGhost);
        const cw = doc.getTextWidth(costText);
        doc.text(` (~${homeCurrency.symbol}${converted.toLocaleString()})`, textX + cw, ty);
      }
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(...C.sage);
      doc.text('Free', textX, ty);
    }

    if (act.duration_minutes) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...C.inkGhost);
      doc.text(fmtDuration(act.duration_minutes), CARD_X + CARD_W - PAD, ty, { align: 'right' });
    }
    ty += 4.5;
  }

  if (tipLines.length) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6);
    doc.setTextColor(...C.inkSecondary);
    doc.text(tipLines, textX, ty);
    ty += tipLines.length * LH.small + S;
  }

  if (transportLines.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...C.teal);
    doc.text(transportLines, textX, ty);
  }

  doc.setDrawColor(...C.divider);
  doc.setLineWidth(0.3);
  doc.line(TIMELINE_X, ctx.y + 4.5, TIMELINE_X, ctx.y + cardH + 4);

  ctx.y += cardH + 4;
}

function drawDayCostBar(doc, ctx, dayCost, destSym, destCode, homeCurrency) {
  if (dayCost <= 0) return;
  ctx.y += 2;

  if (ctx.y + 10 > BOTTOM) return;

  doc.setFillColor(...C.amberLight);
  doc.roundedRect(MX, ctx.y, CW, 8, 1.5, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.ink);
  doc.text('Day Total', MX + 5, ctx.y + 5.2);

  doc.setFont('courier', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...C.ink);
  let costStr = `${destSym}${dayCost.toLocaleString()}`;
  if (homeCurrency?.code && destCode && homeCurrency.code !== destCode) {
    const converted = convert(dayCost, destCode, homeCurrency.code);
    costStr += `  (~${homeCurrency.symbol}${converted.toLocaleString()})`;
  }
  doc.text(costStr, MX_R - 5, ctx.y + 5.2, { align: 'right' });

  ctx.y += 12;
}

export function renderDayPages(doc, ctx, trip, photos, homeCurrency) {
  const ws = trip.wizard_state;
  const dest = ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
  const destSym = dest?.currencySymbol || '$';
  const destCode = dest?.currencyCode || 'USD';
  const days = trip.itinerary_days || [];

  for (const day of days) {
    const color = dayColor(day.day_number);
    const acts = (day.activities || []).slice().sort((a, b) => {
      if (a.start_time && b.start_time) return a.start_time.localeCompare(b.start_time);
      return (a.sort_order || 0) - (b.sort_order || 0);
    });

    doc.addPage();
    ctx.page++;
    ctx.y = 14;
    ctx.accentColor = color;
    drawPageAccent(doc, color);

    drawDayHeader(doc, ctx, day, color);

    let dayCost = 0;
    for (const act of acts) {
      const photoKey = `${day.day_number}-${act.sort_order || 0}`;
      const photoData = photos.activities[photoKey] || null;
      drawActivityCard(doc, ctx, act, color, photoData, destSym, destCode, homeCurrency);
      dayCost += act.cost_amount || 0;
    }

    drawDayCostBar(doc, ctx, dayCost, destSym, destCode, homeCurrency);
  }
}
