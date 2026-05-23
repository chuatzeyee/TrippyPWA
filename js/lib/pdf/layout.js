import { C } from './colors.js';

export const PW = 210;
export const PH = 297;
export const MX = 16;
export const MX_R = PW - MX;
export const CW = MX_R - MX;
export const BOTTOM = PH - 16;

export function ensureSpace(doc, ctx, needed) {
  if (ctx.y + needed > BOTTOM) {
    doc.addPage();
    ctx.page++;
    ctx.y = 14;
    drawPageAccent(doc, ctx.accentColor);
    return true;
  }
  return false;
}

export function drawPageAccent(doc, color) {
  doc.setFillColor(...(color || C.terracotta));
  doc.rect(0, 0, PW, 1.5, 'F');
}

export function drawAllFooters(doc, totalPages) {
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.inkGhost);
    doc.text('Trippy', MX, PH - 6);
    doc.text(`${i} / ${totalPages}`, MX_R, PH - 6, { align: 'right' });
  }
}

export function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
}

export function fmtDateShort(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short'
  });
}

export function fmtDuration(min) {
  if (!min) return '';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
