/* Le chat, dessiné en SVG. Partagé entre le compagnon et le tableau de bord. */
window.CAT_SVG = `
<svg class="cat" viewBox="0 0 132 102" aria-hidden="true">
  <ellipse class="shadow" cx="62" cy="96" rx="40" ry="4.5"/>
  <g class="all">
    <g class="tail">
      <path class="tail-line" d="M33 66 C 14 64, 6 46, 14 30"/>
      <path class="tail-fur" d="M33 66 C 14 64, 6 46, 14 30"/>
    </g>
    <g class="leg leg-bl"><rect class="fur" x="31" y="70" width="11" height="23" rx="5.5"/></g>
    <g class="leg leg-fl"><rect class="fur" x="71" y="70" width="11" height="23" rx="5.5"/></g>
    <g class="body-g">
      <ellipse class="fur" cx="57" cy="65" rx="33" ry="19.5"/>
      <ellipse class="belly" cx="62" cy="74" rx="19" ry="8"/>
      <path class="stripe" d="M44 48 q3 7 1 13"/>
      <path class="stripe" d="M54 46.5 q3 7 1 13"/>
      <path class="stripe" d="M35 52 q3 6 1 11"/>
    </g>
    <g class="leg leg-br"><rect class="fur" x="41" y="72" width="11" height="22" rx="5.5"/></g>
    <g class="leg leg-fr"><rect class="fur" x="81" y="72" width="11" height="22" rx="5.5"/></g>
    <g class="head-g">
      <g class="ears">
        <path class="fur" d="M77 37 L80 12 L94 27 Z"/>
        <path class="fur" d="M97 27 L111 11 L114 38 Z"/>
        <path class="ear-in" d="M81 31 L82 19 L90 27 Z"/>
        <path class="ear-in" d="M101 27 L109 18 L110 32 Z"/>
      </g>
      <circle class="fur" cx="95" cy="45" r="21"/>
      <path class="stripe" d="M91.5 26 v5 M98.5 26 v5"/>
      <g class="eyes-open">
        <ellipse class="eye" cx="88" cy="45" rx="3.2" ry="4.2"/>
        <ellipse class="eye" cx="103" cy="45" rx="3.2" ry="4.2"/>
        <circle class="shine" cx="89.2" cy="43.4" r="1.2"/>
        <circle class="shine" cx="104.2" cy="43.4" r="1.2"/>
      </g>
      <g class="eyes-closed face"><path d="M84.5 46 q3.5 3 7 0"/><path d="M99.5 46 q3.5 3 7 0"/></g>
      <g class="eyes-happy face"><path d="M84.5 47 q3.5 -4.5 7 0"/><path d="M99.5 47 q3.5 -4.5 7 0"/></g>
      <g class="brows face"><path d="M84 38.5 l8 3"/><path d="M107 38.5 l-8 3"/></g>
      <ellipse class="cheek" cx="83" cy="52.5" rx="4" ry="2.4"/>
      <ellipse class="cheek" cx="108" cy="52.5" rx="4" ry="2.4"/>
      <path class="nose" d="M93.6 50.2 h3.6 l-1.8 2.2 z"/>
      <path class="face" d="M95.4 52.4 q-1.6 3 -4 1.2 M95.4 52.4 q1.6 3 4 1.2"/>
      <g class="whiskers face"><path d="M80 51 h-11 M80 54 l-10 3 M111 51 h11 M111 54 l10 3"/></g>
      <g class="headphones">
        <path class="hp-band" d="M74.5 45 A 20.5 23 0 0 1 115.5 45"/>
        <rect class="hp-cup" x="70" y="38" width="8" height="15" rx="4"/>
        <rect class="hp-cup" x="113" y="38" width="8" height="15" rx="4"/>
      </g>
    </g>
  </g>
</svg>`;

window.COATS = {
  orange: { name: 'Roux', fur: '#f7a74c', stripe: '#dd7d2a', belly: '#fde6c8', line: '#5a3a22', eye: '#2b1d17', face: '#5a3a22', earIn: '#ffb3b8' },
  gris: { name: 'Gris', fur: '#a4adb8', stripe: '#78828e', belly: '#e8ecf0', line: '#3a4048', eye: '#2f5a33', face: '#3a4048', earIn: '#f4b6bf' },
  noir: { name: 'Noir', fur: '#3a3640', stripe: '#2c2931', belly: '#56505e', line: '#0f0d12', eye: '#f3c93b', face: '#f3d27a', earIn: '#d98b98' },
  blanc: { name: 'Blanc', fur: '#faf6f0', stripe: '#e6ddd0', belly: '#ffffff', line: '#6b5d50', eye: '#2d6fb0', face: '#6b5d50', earIn: '#ffc2c8' },
  siamois: { name: 'Siamois', fur: '#f1e3cc', stripe: '#7a5644', belly: '#fff7ea', line: '#4a3428', eye: '#3b7fd1', face: '#4a3428', earIn: '#7a5644' },
};

window.applyCoat = function applyCoat(el, coat) {
  const c = window.COATS[coat] || window.COATS.orange;
  el.style.setProperty('--fur', c.fur);
  el.style.setProperty('--stripe', c.stripe);
  el.style.setProperty('--belly', c.belly);
  el.style.setProperty('--line', c.line);
  el.style.setProperty('--eye', c.eye);
  el.style.setProperty('--face', c.face);
  el.style.setProperty('--ear-in', c.earIn);
};
