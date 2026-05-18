const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDayDate(tripStartDate, dayIndex) {
  const d = new Date(tripStartDate + 'T00:00:00');
  d.setDate(d.getDate() + dayIndex);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function renumberDays(trip) {
  return {
    ...trip,
    days: trip.days.map((day, i) => ({
      ...day,
      num: i + 1,
      date: formatDayDate(trip.dates.start, i)
    }))
  };
}

function recalcDayCost(day) {
  const costs = { transport: 0, food: 0, activities: 0, accommodation: 0 };
  (day.activities || []).forEach(a => {
    const amount = a.cost?.amount || a.cost?.aud || 0;
    if (a.type === 'transport') costs.transport += amount;
    else if (a.type === 'food') costs.food += amount;
    else costs.activities += amount;
  });
  return { ...day, dayCost: costs };
}

export function addDay(trip, dayData) {
  const newDay = recalcDayCost({
    num: (trip.days?.length || 0) + 1,
    date: formatDayDate(trip.dates.start, trip.days?.length || 0),
    title: dayData.title || 'New Day',
    theme: dayData.theme || '',
    weather: dayData.weather || { high: 20, low: 10, icon: '☁️', desc: '' },
    activities: [],
    dayCost: { transport: 0, food: 0, activities: 0, accommodation: 0 }
  });
  return renumberDays({ ...trip, days: [...(trip.days || []), newDay] });
}

export function updateDay(trip, dayIndex, dayData) {
  const days = trip.days.map((day, i) => {
    if (i !== dayIndex) return day;
    return {
      ...day,
      title: dayData.title ?? day.title,
      theme: dayData.theme ?? day.theme,
      weather: dayData.weather ?? day.weather
    };
  });
  return renumberDays({ ...trip, days });
}

export function removeDay(trip, dayIndex) {
  const days = trip.days.filter((_, i) => i !== dayIndex);
  return renumberDays({ ...trip, days });
}

export function addActivity(trip, dayIndex, activityData) {
  const days = trip.days.map((day, i) => {
    if (i !== dayIndex) return day;
    const activity = {
      time: activityData.time || '09:00',
      end: activityData.end || '',
      title: activityData.title || '',
      type: activityData.type || 'culture',
      desc: activityData.desc || '',
      atmosphere: [],
      img: activityData.img || '',
      map: activityData.map || '',
      booking: activityData.booking || '',
      cost: { amount: activityData.costAmount || 0, note: activityData.costNote || '' },
      transport: activityData.transport || []
    };
    const activities = [...day.activities, activity].sort((a, b) => a.time.localeCompare(b.time));
    return recalcDayCost({ ...day, activities });
  });
  return { ...trip, days };
}

export function updateActivity(trip, dayIndex, activityIndex, activityData) {
  const days = trip.days.map((day, i) => {
    if (i !== dayIndex) return day;
    const activities = day.activities.map((act, j) => {
      if (j !== activityIndex) return act;
      return {
        ...act,
        time: activityData.time ?? act.time,
        end: activityData.end ?? act.end,
        title: activityData.title ?? act.title,
        type: activityData.type ?? act.type,
        desc: activityData.desc ?? act.desc,
        img: activityData.img ?? act.img,
        map: activityData.map ?? act.map,
        booking: activityData.booking ?? act.booking,
        cost: {
          amount: activityData.costAmount ?? act.cost?.amount ?? 0,
          note: activityData.costNote ?? act.cost?.note ?? ''
        },
        transport: activityData.transport ?? act.transport
      };
    }).sort((a, b) => a.time.localeCompare(b.time));
    return recalcDayCost({ ...day, activities });
  });
  return { ...trip, days };
}

export function removeActivity(trip, dayIndex, activityIndex) {
  const days = trip.days.map((day, i) => {
    if (i !== dayIndex) return day;
    const activities = day.activities.filter((_, j) => j !== activityIndex);
    return recalcDayCost({ ...day, activities });
  });
  return { ...trip, days };
}

export function moveActivity(trip, dayIndex, fromIndex, toIndex) {
  const days = trip.days.map((day, i) => {
    if (i !== dayIndex) return day;
    if (toIndex < 0 || toIndex >= day.activities.length) return day;
    const activities = [...day.activities];
    const [moved] = activities.splice(fromIndex, 1);
    activities.splice(toIndex, 0, moved);
    return { ...day, activities };
  });
  return { ...trip, days };
}

export function moveDay(trip, fromIndex, toIndex) {
  if (toIndex < 0 || toIndex >= trip.days.length) return trip;
  const days = [...trip.days];
  const [moved] = days.splice(fromIndex, 1);
  days.splice(toIndex, 0, moved);
  return renumberDays({ ...trip, days });
}

export function duplicateDay(trip, dayIndex) {
  const source = trip.days[dayIndex];
  if (!source) return trip;
  const copy = {
    ...source,
    title: `${source.title} (copy)`,
    activities: source.activities.map(a => ({ ...a, cost: { ...a.cost } }))
  };
  const days = [...trip.days];
  days.splice(dayIndex + 1, 0, copy);
  return renumberDays({ ...trip, days });
}

export function duplicateActivity(trip, dayIndex, activityIndex) {
  const days = trip.days.map((day, i) => {
    if (i !== dayIndex) return day;
    const source = day.activities[activityIndex];
    if (!source) return day;
    const copy = { ...source, cost: { ...source.cost }, title: `${source.title} (copy)` };
    const activities = [...day.activities];
    activities.splice(activityIndex + 1, 0, copy);
    return recalcDayCost({ ...day, activities });
  });
  return { ...trip, days };
}

export function moveActivityBetweenDays(trip, fromDayIndex, activityIndex, toDayIndex) {
  const fromDay = trip.days[fromDayIndex];
  const toDay = trip.days[toDayIndex];
  if (!fromDay || !toDay) return trip;
  const activity = fromDay.activities[activityIndex];
  if (!activity) return trip;

  const days = trip.days.map((day, i) => {
    if (i === fromDayIndex) {
      return recalcDayCost({
        ...day,
        activities: day.activities.filter((_, j) => j !== activityIndex)
      });
    }
    if (i === toDayIndex) {
      const activities = [...day.activities, activity].sort((a, b) => a.time.localeCompare(b.time));
      return recalcDayCost({ ...day, activities });
    }
    return day;
  });
  return { ...trip, days };
}

export function bulkRemoveActivities(trip, dayIndex, activityIndices) {
  const indexSet = new Set(activityIndices);
  const days = trip.days.map((day, i) => {
    if (i !== dayIndex) return day;
    const activities = day.activities.filter((_, j) => !indexSet.has(j));
    return recalcDayCost({ ...day, activities });
  });
  return { ...trip, days };
}

export function updateTripMeta(trip, meta) {
  const updated = {
    ...trip,
    title: meta.title ?? trip.title,
    subtitle: meta.subtitle ?? trip.subtitle,
    emoji: meta.emoji ?? trip.emoji,
    travelers: meta.travelers ?? trip.travelers,
    dates: meta.dates ? { ...trip.dates, ...meta.dates } : trip.dates,
    budget: meta.budget ? { ...trip.budget, ...meta.budget } : trip.budget,
    status: meta.status ?? trip.status
  };
  if (meta.dates) return renumberDays(updated);
  return updated;
}

export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function maxDays(trip) {
  const start = new Date(trip.dates.start + 'T00:00:00');
  const end = new Date(trip.dates.end + 'T00:00:00');
  return Math.round((end - start) / 86400000) + 1;
}
