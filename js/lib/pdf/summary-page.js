import { C, dayColor, categoryBadge } from './colors.js';
import { PW, MX, MX_R, CW, BOTTOM, ensureSpace, drawPageAccent } from './layout.js';
import { convert } from '../../data/currencies.js';

function groupCostsByCategory(days) {
  const groups = {};
  for (const day of days) {
    for (const act of (day.activities || [])) {
      if (!act.cost_amount || act.cost_amount <= 0) continue;
      const badge = categoryBadge(act.category);
      const label = badge.label;
      if (!groups[label]) groups[label] = { total: 0, color: badge.color };
      groups[label].total += act.cost_amount;
    }
  }
  return Object.entries(groups)
    .sort((a, b) => b[1].total - a[1].total);
}

function costPerDay(days) {
  return days.map(d => {
    let total = 0;
    for (const a of (d.activities || [])) total += a.cost_amount || 0;
    return { dayNum: d.day_number, total };
  });
}

export function renderSummaryPage(doc, ctx, trip, homeCurrency) {
  const ws = trip.wizard_state;
  const dest = ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
  const destSym = dest?.currencySymbol || '$';
  const destCode = dest?.currencyCode || 'USD';
  const days = trip.itinerary_days || [];

  let totalCost = 0;
  for (const d of days) {
    for (const a of (d.activities || [])) totalCost += a.cost_amount || 0;
  }

  doc.addPage();
  ctx.page++;
  ctx.y = 14;
  ctx.accentColor = C.terracotta;
  drawPageAccent(doc, C.terracotta);

  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...C.ink);
  doc.text('Trip Budget Summary', MX, ctx.y);
  ctx.y += 10;

  doc.setFillColor(...C.white);
  doc.setDrawColor(...C.cardBorder);
  doc.setLineWidth(0.3);

  const catGroups = groupCostsByCategory(days);
  const perDay = costPerDay(days);

  const leftW = (CW - 8) / 2;
  const rightX = MX + leftW + 8;
  const cardH = Math.max(50, 26 + catGroups.length * 6, 26 + perDay.length * 7);

  doc.roundedRect(MX, ctx.y, CW, cardH, 3, 3, 'FD');

  let ly = ctx.y + 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...C.inkGhost);
  doc.text('ACTIVITIES TOTAL', MX + 6, ly);
  ly += 7;

  doc.setFont('courier', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...C.ink);
  doc.text(`${destSym}${totalCost.toLocaleString()}`, MX + 6, ly);
  ly += 5;

  if (homeCurrency?.code && destCode && homeCurrency.code !== destCode && totalCost > 0) {
    const converted = convert(totalCost, destCode, homeCurrency.code);
    doc.setFont('courier', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...C.inkGhost);
    doc.text(`~${homeCurrency.symbol}${converted.toLocaleString()}`, MX + 6, ly);
    ly += 7;
  } else {
    ly += 3;
  }

  for (const [label, data] of catGroups) {
    doc.setFillColor(...data.color);
    doc.circle(MX + 8, ly - 1, 1.2, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.inkSecondary);
    doc.text(label.charAt(0) + label.slice(1).toLowerCase(), MX + 12, ly);

    doc.setFont('courier', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...C.ink);
    doc.text(`${destSym}${data.total.toLocaleString()}`, MX + leftW - 2, ly, { align: 'right' });
    ly += 6;
  }

  let ry = ctx.y + 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...C.inkGhost);
  doc.text('DAILY AVERAGE', rightX, ry);
  ry += 7;

  const avg = days.length > 0 ? Math.round(totalCost / days.length) : 0;
  doc.setFont('courier', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...C.terracotta);
  doc.text(`${destSym}${avg.toLocaleString()}/day`, rightX, ry);
  ry += 5;

  if (homeCurrency?.code && destCode && homeCurrency.code !== destCode && avg > 0) {
    const convAvg = convert(avg, destCode, homeCurrency.code);
    doc.setFont('courier', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C.inkGhost);
    doc.text(`~${homeCurrency.symbol}${convAvg.toLocaleString()}/day`, rightX, ry);
    ry += 7;
  } else {
    ry += 3;
  }

  const maxDayCost = Math.max(...perDay.map(d => d.total), 1);
  const barMaxW = leftW - 16;

  for (const d of perDay) {
    const color = dayColor(d.dayNum);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...C.inkGhost);
    doc.text(`D${d.dayNum}`, rightX, ry);

    const barW = Math.max((d.total / maxDayCost) * barMaxW, 1);
    doc.setFillColor(...color);
    doc.roundedRect(rightX + 10, ry - 2.5, barW, 3, 0.5, 0.5, 'F');

    if (d.total > 0) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(5.5);
      doc.setTextColor(...C.inkSecondary);
      doc.text(`${destSym}${d.total.toLocaleString()}`, rightX + 12 + barW, ry);
    }
    ry += 7;
  }

  ctx.y += cardH + 8;

  const tips = trip.extras?.savingsTips;
  if (Array.isArray(tips) && tips.length > 0) {
    ensureSpace(doc, ctx, 20);

    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...C.sage);
    doc.text('Savings Tips', MX, ctx.y);
    ctx.y += 8;

    for (const tip of tips) {
      ensureSpace(doc, ctx, 10);

      doc.setFillColor(...C.sage);
      doc.circle(MX + 3, ctx.y, 1.2, 'F');

      const tipText = typeof tip === 'string' ? tip : (tip.text || tip.tip || '');
      const tipTitle = typeof tip === 'object' ? (tip.title || '') : '';

      if (tipTitle) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...C.ink);
        doc.text(tipTitle, MX + 8, ctx.y + 1);
        ctx.y += 4;
      }

      if (tipText) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...C.inkSecondary);
        const lines = doc.splitTextToSize(tipText, CW - 10);
        doc.text(lines, MX + 8, ctx.y + 1);
        ctx.y += lines.length * 3.2 + 3;
      } else {
        ctx.y += 4;
      }
    }
  }

  ctx.y += 8;
  ensureSpace(doc, ctx, 10);
  doc.setDrawColor(...C.divider);
  doc.setLineWidth(0.3);
  doc.line(MX, ctx.y, MX_R, ctx.y);
  ctx.y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.inkGhost);
  doc.text('Generated by Trippy', MX, ctx.y);
  doc.text(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }), MX_R, ctx.y, { align: 'right' });
}
