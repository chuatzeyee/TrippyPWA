// The frozen stub view: a contract-minimal fourth view with the id 'stub'. The integration tasks and
// the screenshot harness use it, so nothing is integrated against a view that is still being built.
// The registry offers it only when import.meta.env.DEV is true. Steward: F0.
import '../../shared/styles.js';
import './stub.css';

export const id = 'stub';
export { renderDashboard, mountDashboard } from './dashboard.js';
export { renderTripLanding, mountTripLanding } from './trip.js';
