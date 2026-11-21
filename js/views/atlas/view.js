// F0 stub, owner VC: the atlas view's entry chunk. It is the only file the registry imports: one
// dynamic import brings the renderers, the shared component styles and this view's skin together.
import '../shared/styles.js';
import '../../../css/views/atlas.css';

export const id = 'atlas';
export { renderDashboard, mountDashboard } from './dashboard.js';
export { renderTripLanding, mountTripLanding } from './trip.js';
export { renderAtlasPage, mountAtlasPage } from './atlas-page.js';
