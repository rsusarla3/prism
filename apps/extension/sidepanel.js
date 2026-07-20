// Open the chosen product surface in a new tab on the local web app.
const BASE = 'http://localhost:8787';
document.getElementById('core').onclick = () => window.open(`${BASE}/#core`, '_blank');
document.getElementById('future').onclick = () => window.open(`${BASE}/#future`, '_blank');
