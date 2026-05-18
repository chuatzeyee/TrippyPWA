const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function sameDay(a, b) {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function inRange(date, start, end) {
  if (!start || !end) return false;
  return date >= start && date <= end;
}

export function renderCalendar(container, { start, end, onSelect }) {
  let viewDate = start ? parseDate(start) : new Date();
  let selStart = parseDate(start);
  let selEnd = parseDate(end);
  let phase = selStart && selEnd ? 'done' : selStart ? 'end' : 'start';
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function render() {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startWeekday = firstDay.getDay() - 1;
    if (startWeekday < 0) startWeekday = 6;

    let cells = '';
    for (let i = 0; i < startWeekday; i++) {
      cells += '<div class="cal-cell cal-cell--empty"></div>';
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      const dateStr = toDateStr(date);
      const isPast = date < today;
      const isStart = sameDay(date, selStart);
      const isEnd = sameDay(date, selEnd);
      const isInRange = inRange(date, selStart, selEnd) && !isStart && !isEnd;
      const isToday = sameDay(date, today);

      let cls = 'cal-cell cal-cell--day';
      if (isPast) cls += ' cal-cell--past';
      if (isStart) cls += ' cal-cell--start';
      if (isEnd) cls += ' cal-cell--end';
      if (isInRange) cls += ' cal-cell--range';
      if (isToday && !isStart && !isEnd) cls += ' cal-cell--today';

      cells += `<div class="${cls}" ${isPast ? '' : `data-date="${dateStr}"`}>${d}</div>`;
    }

    container.innerHTML = `
      <div class="cal">
        <div class="cal-header">
          <button class="cal-nav" data-cal-nav="prev" type="button">‹</button>
          <span class="cal-title">${MONTHS[month]} ${year}</span>
          <button class="cal-nav" data-cal-nav="next" type="button">›</button>
        </div>
        <div class="cal-weekdays">
          ${DAYS.map(d => `<div class="cal-weekday">${d}</div>`).join('')}
        </div>
        <div class="cal-grid">${cells}</div>
      </div>
    `;

    container.querySelector('[data-cal-nav="prev"]').addEventListener('click', () => {
      viewDate = new Date(year, month - 1, 1);
      render();
    });
    container.querySelector('[data-cal-nav="next"]').addEventListener('click', () => {
      viewDate = new Date(year, month + 1, 1);
      render();
    });

    container.querySelectorAll('[data-date]').forEach(cell => {
      cell.addEventListener('click', () => {
        const clicked = parseDate(cell.dataset.date);
        if (phase === 'start' || phase === 'done') {
          selStart = clicked;
          selEnd = null;
          phase = 'end';
        } else {
          if (clicked < selStart) {
            selEnd = selStart;
            selStart = clicked;
          } else {
            selEnd = clicked;
          }
          phase = 'done';
          onSelect(toDateStr(selStart), toDateStr(selEnd));
        }
        render();
      });
    });
  }

  render();
}
