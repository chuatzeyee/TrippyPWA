// F0 stub, owner VA: the departures view's entry chunk. It is the only file the registry imports: one
// dynamic import brings the renderers, the shared component styles and this view's skin together.
import '../shared/styles.js';
import '../../../css/views/departures.css';

export const id = 'departures';
export { renderDashboard, mountDashboard } from './dashboard.js';
export { renderTripLanding, mountTripLanding } from './trip.js';
