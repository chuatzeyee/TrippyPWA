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
    const weather = day.weather ? ` · ${day.weather}` : '';
    doc.text(`${fmtDateShort(day.date)}${weather}`, textX, ctx.y + 8);
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
  const contentW = hasPhoto ? CARD_W - 36 : CARD_W - 8;

  const descLines = act.description
    ? doc.splitTextToSize(act.description, contentW)
    : [];
  const maxDescLines = hasPhoto ? 3 : 4;
  const clampedDesc = descLines.slice(0, maxDescLines);

  let cardH = 6;
  cardH += 5;
  if (act.venue_name) cardH += 4;
  cardH += clampedDesc.length * 3.2;
  if (act.cost_amount || !NO_COST_CATS.has((act.category || '').toLowerCase())) cardH += 5;
  if (act.tips) cardH += 4;
  if (act.getting_there || act.transport_mode) cardH += 4;
  cardH = Math.max(cardH, hasPhoto ? 28 : 16);

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
    doc.setFontSize(8);
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
  doc.setFontSize(5.5);
  const badgeW = doc.getTextWidth(badge.label) + 4;
  doc.roundedRect(CARD_X + 3, ctx.y + 2, badgeW, 4, 2, 2, 'F');
  doc.setTextColor(...C.white);
  doc.text(badge.label, CARD_X + 3 + badgeW / 2, ctx.y + 4.8, { align: 'center' });

  if (hasPhoto) {
    try {
      doc.addImage(photoData, 'JPEG', CARD_X + CARD_W - 34, ctx.y + 2, 31, 23);
    } catch { /* photo render failed */ }
  }

  let ty = ctx.y + 8;
  const textX = CARD_X + 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.ink);
  const titleMaxW = hasPhoto ? contentW - 4 : CARD_W - 12;
  const titleText = act.title || '';
  const truncTitle = doc.getTextWidth(titleText) > titleMaxW
    ? titleText.slice(0, 40) + '..' : titleText;
  doc.text(truncTitle, textX, ty);
  ty += 4;

  if (act.venue_name) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.teal);
    doc.text(act.venue_name, textX, ty);
    ty += 4;
  }

  if (clampedDesc.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.inkSecondary);
    doc.text(clampedDesc, textX, ty);
    ty += clampedDesc.length * 3.2;
  }

  const cat = (act.category || '').toLowerCase();
  if (act.cost_amount || !NO_COST_CATS.has(cat)) {
    ty += 1;
    if (act.cost_amount && act.cost_amount > 0) {
      doc.setFont('courier', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...C.ink);
      const costText = `${destSym}${act.cost_amount.toLocaleString()}`;
      doc.text(costText, textX, ty);

      if (homeCurrency?.code && destCode && homeCurrency.code !== destCode) {
        const converted = convert(act.cost_amount, destCode, homeCurrency.code);
        doc.setFont('courier', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...C.inkGhost);
        const cw = doc.getTextWidth(costText);
        doc.text(` (~${homeCurrency.symbol}${converted.toLocaleString()})`, textX + cw, ty);
      }
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.sage);
      doc.text('Free', textX, ty);
    }

    if (act.duration_minutes) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...C.inkGhost);
      doc.text(fmtDuration(act.duration_minutes), CARD_X + CARD_W - 5, ty, { align: 'right' });
    }
    ty += 4;
  }

  if (act.tips) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.inkSecondary);
    const tipLines = doc.splitTextToSize(`Tip: ${act.tips}`, contentW);
    doc.text(tipLines[0] || '', textX, ty);
    ty += 4;
  }

  if (act.getting_there || act.transport_mode) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.teal);
    const transport = act.getting_there || `${act.transport_mode || ''} ${act.transport_duration || ''}`.trim();
    doc.text(transport, textX, ty);
  }

  doc.setDrawColor(...C.divider);
  doc.setLineWidth(0.3);
  doc.line(TIMELINE_X, ctx.y + 4.5, TIMELINE_X, ctx.y + cardH + 3);

  ctx.y += cardH + 3;
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
