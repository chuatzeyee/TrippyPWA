// The shared component styles. A view imports this once, from its view.js, and so does Settings.
// Which sheet reaches the document first is not something any rule may rely on: the cascade between
// these sheets and a skin is decided by specificity alone (blueprint 8.1). Owner: F0.
import '../../../css/views/shared/common.css';
import '../../../css/views/shared/trip.css';
import '../../../css/views/shared/trip-reset.css';
import '../../../css/views/shared/maps.css';
