// The Concierge view's entry chunk. Owner: VB. It is the only file the registry imports: one dynamic
// import brings the renderers, the shared component styles and this view's skin together.
import '../shared/styles.js';
import '../../../css/views/concierge.css';

export const id = 'concierge';
export { renderDashboard, mountDashboard } from './dashboard.js';
export { renderTripLanding, mountTripLanding } from './trip.js';
