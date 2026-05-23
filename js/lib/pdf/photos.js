import { fetchPlacePhoto, fetchPlacePhotoByQuery } from '../../services/generate.js';

const PHOTO_PRIORITY = [
  'sightseeing', 'culture', 'museum', 'nature', 'park', 'beach',
  'art', 'history', 'walking tour', 'entertainment',
  'food', 'restaurant', 'dining', 'cafe', 'shopping'
];

function loadImageAsDataUrl(url, targetW, targetH) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 10000);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        const srcRatio = img.naturalWidth / img.naturalHeight;
        const dstRatio = targetW / targetH;
        let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
        if (srcRatio > dstRatio) {
          sw = img.naturalHeight * dstRatio;
          sx = (img.naturalWidth - sw) / 2;
        } else {
          sh = img.naturalWidth / dstRatio;
          sy = (img.naturalHeight - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      } catch { resolve(null); }
    };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

function hiResWikipedia(url) {
  if (!url) return null;
  return url.replace(/\/\d+px-/, '/800px-');
}

export function loadCoverImageWithGradient(url) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 12000);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      clearTimeout(timer);
      try {
        const cw = 1200, ch = 800;
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        const srcRatio = img.naturalWidth / img.naturalHeight;
        const dstRatio = cw / ch;
        let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
        if (srcRatio > dstRatio) {
          sw = img.naturalHeight * dstRatio;
          sx = (img.naturalWidth - sw) / 2;
        } else {
          sh = img.naturalWidth / dstRatio;
          sy = (img.naturalHeight - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
        const grad = ctx.createLinearGradient(0, ch * 0.45, 0, ch);
        grad.addColorStop(0, 'rgba(44, 42, 37, 0)');
        grad.addColorStop(0.6, 'rgba(44, 42, 37, 0.55)');
        grad.addColorStop(1, 'rgba(44, 42, 37, 0.92)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, cw, ch);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      } catch { resolve(null); }
    };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = hiResWikipedia(url);
  });
}

function selectPhotoActivities(days, maxPerDay) {
  const picks = [];
  for (const day of days) {
    const acts = day.activities || [];
    const ranked = acts
      .filter(a => a.venue_name)
      .sort((a, b) => {
        const ai = PHOTO_PRIORITY.indexOf((a.category || '').toLowerCase());
        const bi = PHOTO_PRIORITY.indexOf((b.category || '').toLowerCase());
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
    for (let i = 0; i < Math.min(maxPerDay, ranked.length); i++) {
      picks.push({ dayNum: day.day_number, activity: ranked[i] });
    }
  }
  return picks;
}

export async function fetchAllPhotos(trip, onProgress) {
  const result = { cover: null, activities: {} };
  const ws = trip.wizard_state;
  const dest = ws?.multiCity ? ws?.destinations?.[0] : ws?.destination;
  const destName = dest?.name || '';
  const days = trip.itinerary_days || [];

  const tasks = [];

  if (dest?.image) {
    tasks.push({
      key: 'cover',
      fn: () => loadCoverImageWithGradient(dest.image)
    });
  }

  const actPicks = selectPhotoActivities(days, 2);
  const MAX_ACTIVITY_PHOTOS = 15;
  for (const pick of actPicks.slice(0, MAX_ACTIVITY_PHOTOS)) {
    const a = pick.activity;
    const id = `${pick.dayNum}-${a.sort_order || 0}`;
    tasks.push({
      key: `act-${id}`,
      fn: async () => {
        let url = null;
        if (a.place_id) {
          url = await fetchPlacePhoto(a.place_id, 400);
        }
        if (!url && a.venue_name) {
          const loc = (a.latitude && a.longitude) ? { lat: a.latitude, lng: a.longitude } : undefined;
          url = await fetchPlacePhotoByQuery(`${a.venue_name} ${destName}`, loc, 400);
        }
        if (!url) return null;
        return loadImageAsDataUrl(url, 240, 180);
      }
    });
  }

  let done = 0;
  const total = tasks.length || 1;
  const CONCURRENCY = 4;

  for (let i = 0; i < tasks.length; i += CONCURRENCY) {
    const batch = tasks.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(t => t.fn()));
    results.forEach((r, idx) => {
      const task = batch[idx];
      const value = r.status === 'fulfilled' ? r.value : null;
      if (task.key === 'cover') {
        result.cover = value;
      } else {
        const actKey = task.key.replace('act-', '');
        if (value) result.activities[actKey] = value;
      }
    });
    done += batch.length;
    onProgress?.('photos', Math.round((done / total) * 70));
  }

  return result;
}
