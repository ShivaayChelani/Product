/* eslint-disable no-useless-escape */
import { LEAFLET_VENDOR_CSS, LEAFLET_VENDOR_JS } from './leafletVendor';

const INDIA_BOUNDS: [[number, number], [number, number]] = [
  [6.0, 68.0],
  [37.5, 98.5],
];

export function generateLeafletHtml(): string {
  const safeCss = LEAFLET_VENDOR_CSS.replace(/<\/style/gi, '<\\/style');
  const safeJs = LEAFLET_VENDOR_JS.replace(/<\/script/gi, '<\\/script');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
${safeCss}
</style>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body,#map{width:100%;height:100%;background:#ECECEC}

  .map-pin{
    position:relative;cursor:pointer;display:flex;flex-direction:column;align-items:center;
    transform-origin:bottom center;
  }

  .pin-badge{
    width:32px;height:32px;border-radius:50% 50% 50% 6px;
    background:linear-gradient(145deg,var(--pin-highlight,rgba(255,255,255,.35)) 0%,transparent 38%),
      var(--pin-color,#00A8A8);
    border:1.5px solid rgba(255,255,255,.96);
    box-shadow:
      0 2px 7px rgba(0,0,0,.32),
      0 4px 10px rgba(0,0,0,.14);
    display:flex;align-items:center;justify-content:center;
    position:relative;flex-shrink:0;transform:rotate(-45deg);
    transition:transform .2s ease, box-shadow .2s ease;
  }

  /* Vendor pins: rounded square + amber edge so they read differently from places */
  .map-pin.vendor-pin .pin-badge{
    width:30px;height:30px;border-radius:9px;
    border:2px solid #FFF8E7;
    box-shadow:
      0 2px 7px rgba(0,0,0,.5);
    transform:none;
  }
  .pin-icon-box{
    width:22px;height:22px;border-radius:50%;
    background:#fff;box-shadow:inset 0 1px 1px rgba(255,255,255,.8),0 1px 2px rgba(0,0,0,.12);
    display:flex;align-items:center;justify-content:center;
    transform:rotate(45deg);
  }
  .map-pin.vendor-pin .pin-icon-box{transform:none}
  .pin-offer-flag{
    position:absolute;top:-6px;right:-14px;z-index:2;
    background:linear-gradient(135deg,#EF4444 0%,#DC2626 100%);
    color:#fff;font-size:7px;font-weight:800;letter-spacing:.02em;
    padding:3px 5px 3px 4px;border-radius:3px 3px 3px 1px;
    box-shadow:0 2px 5px rgba(220,38,38,.45);
    transform:rotate(12deg);white-space:nowrap;pointer-events:none;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  }
  .pin-label-rating{
    font-size:8px;font-weight:700;color:#B45309;line-height:1.15;margin-top:1px;
  }
  .pin-icon-box svg{width:14px;height:14px;display:block;fill:var(--pin-color,#00A8A8);
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.12))}

  /* Compact place-name card below the pin (marker colors/icons unchanged above) */
  .pin-label-card{
    display:none !important;
  }
  .pin-label-card.is-hidden{display:none}
  .pin-label-name{
    font-size:10px;font-weight:600;color:#1F2937;
    line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;
    overflow:hidden;word-break:break-word;
  }
  .pin-label-cat{
    font-size:8px;font-weight:600;color:#6B7280;
    line-height:1.15;margin-top:1px;
  }
  .pin-label-dist{
    font-size:8px;font-weight:600;color:#6B7280;
    line-height:1.15;margin-top:1px;
  }
  .map-pin.selected .pin-label-card{
    max-width:108px;padding:4px 8px 5px;
    background:rgba(255,255,255,.97);
    border-color:rgba(255,255,255,1);
    box-shadow:0 3px 12px rgba(15,23,42,.24),0 0 0 1px rgba(255,255,255,.65);
    transform:scale(1.04);
  }
  .map-pin.selected .pin-label-name{font-size:10.5px;font-weight:700}
  .map-pin.selected .pin-label-cat{font-size:8.5px}
  .map-pin.selected .pin-label-dist{font-size:8.5px;color:#4B5563}
  body.base-streets .pin-label-card{
    background:rgba(255,255,255,.95);
    box-shadow:0 2px 7px rgba(15,23,42,.16);
  }

  .map-pin.selected .pin-badge{
    transform:rotate(-45deg) scale(1.12);
    border-color:#fff;
    box-shadow:
      0 0 0 3px rgba(255,255,255,.8),
      0 0 12px rgba(255,255,255,.65),
      0 4px 14px rgba(0,0,0,.38);
    animation:markerBounce .4s cubic-bezier(.175,.885,.32,1.275) forwards;
  }
  .map-pin.selected.vendor-pin .pin-badge{transform:scale(1.1)}
  .map-pin.selected.vendor-pin .pin-badge{
    box-shadow:
      0 0 0 4px rgba(255,248,231,.9),
      0 0 0 8px rgba(245,158,11,.38),
      0 6px 18px rgba(0,0,0,.42);
  }
  @keyframes markerBounce{
    0%{transform:rotate(-45deg) scale(1) translateY(0)}
    50%{transform:rotate(-45deg) scale(1.16) translateY(-4px)}
    100%{transform:rotate(-45deg) scale(1.12) translateY(0)}
  }
  .map-pin.selected.vendor-pin .pin-badge{animation:vendorMarkerBounce .4s cubic-bezier(.175,.885,.32,1.275) forwards}
  @keyframes vendorMarkerBounce{
    0%{transform:scale(1) translateY(0)}
    50%{transform:scale(1.14) translateY(-4px)}
    100%{transform:scale(1.1) translateY(0)}
  }

  /* Cluster pins — circular count badge */
  .map-pin.cluster-pin .pin-badge{
    width:36px;height:36px;border-radius:50%;
    background:linear-gradient(145deg,#0D9488 0%,#008F8F 100%);
    border:2px solid #fff;
    transform:none;
    box-shadow:0 3px 10px rgba(0,0,0,.35);
  }
  .map-pin.cluster-pin .pin-icon-box{
    transform:none;
    background:transparent;
    box-shadow:none;
    width:100%;height:100%;
  }
  .cluster-count{
    color:#fff;font-size:13px;font-weight:800;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    line-height:1;
  }
  /* Streets mode: slightly softer pin halo (less needed on light basemap) */
  body.base-streets .pin-badge{box-shadow:0 2px 8px rgba(0,0,0,.25),0 5px 12px rgba(0,0,0,.12)}
  body.base-streets .pin-label-card{
    background:rgba(255,255,255,.95);
    box-shadow:0 2px 7px rgba(15,23,42,.16);
  }

  @keyframes pinFadeOut {
    to { opacity: 0; transform: scale(0.55) translateY(-10px); }
  }
  .map-pin.is-removing {
    animation: pinFadeOut 0.28s ease forwards;
    pointer-events: none;
  }
  .map-pin.cluster-pin.is-splitting .pin-badge {
    animation: clusterSplit 0.35s ease forwards;
  }
  @keyframes clusterSplit {
    0% { transform: scale(1); opacity: 1; }
    100% { transform: scale(1.35); opacity: 0; }
  }
  .map-pin.cluster-pin .pin-badge {
    transition: transform 0.25s ease, opacity 0.25s ease;
  }

  @keyframes pinDrop{
    0%{opacity:0;transform:translateY(-22px) scale(.25)}
    65%{opacity:1;transform:translateY(3px) scale(1.08)}
    80%{transform:translateY(-2px) scale(.96)}
    100%{opacity:1;transform:translateY(0) scale(1)}
  }
  .map-pin.is-new{
    animation:pinDrop .4s cubic-bezier(.34,1.56,.64,1) forwards;
  }

  .user-dot{
    width:36px;height:36px;border-radius:50%;
    background:radial-gradient(circle,rgba(0,122,255,.28) 0%,rgba(212,175,55,.12) 55%,transparent 70%);
    border:2.5px solid rgba(255,255,255,.95);
    box-shadow:
      0 0 12px rgba(0,122,255,.55),
      0 0 22px rgba(212,175,55,.35),
      0 3px 10px rgba(0,0,0,.4);
    display:flex;align-items:center;justify-content:center;
    animation:userPulse 2.2s cubic-bezier(.4,0,.2,1) infinite;
  }
  .user-dot-inner{
    width:14px;height:14px;border-radius:50%;
    background:radial-gradient(circle at 35% 30%,#5eb0ff 0%,#007AFF 55%,#D4AF37 100%);
    box-shadow:0 0 8px rgba(0,122,255,.8),0 0 14px rgba(212,175,55,.45);
  }
  @keyframes userPulse{
    0%{box-shadow:0 0 12px rgba(0,122,255,.55),0 0 22px rgba(212,175,55,.35),0 0 0 0 rgba(0,122,255,.45)}
    70%{box-shadow:0 0 12px rgba(0,122,255,.55),0 0 22px rgba(212,175,55,.35),0 0 0 18px rgba(0,122,255,0)}
    100%{box-shadow:0 0 12px rgba(0,122,255,.55),0 0 22px rgba(212,175,55,.35),0 0 0 0 rgba(0,122,255,0)}
  }

  .leaflet-marker-icon{
    animation:fadeIn .4s ease-out forwards;
    opacity:0;
    overflow:visible!important;
  }
  .leaflet-div-icon{background:transparent!important;border:none!important}
  .user-location-marker{background:transparent!important;border:none!important;overflow:visible!important}
  @keyframes fadeIn{to{opacity:1}}

  .leaflet-control-zoom{
    border:none!important;
    box-shadow:0 2px 14px rgba(0,0,0,.45)!important;
    border-radius:12px!important;overflow:hidden;
  }
  .leaflet-control-zoom a{
    width:40px!important;height:40px!important;line-height:40px!important;
    font-size:20px!important;color:#e8eef8!important;
    background:#152033!important;border:none!important;
  }
  .leaflet-control-zoom a:hover{background:#1e2c44!important}
  .leaflet-control-zoom a.leaflet-control-zoom-in{
    border-bottom:1px solid rgba(255,255,255,.08)!important;
  }

  .leaflet-control-scale{
    margin-left:16px!important;margin-bottom:16px!important;
    background:rgba(11,18,32,.78)!important;
    border-radius:8px!important;padding:3px 8px!important;
    backdrop-filter:blur(4px);box-shadow:0 1px 8px rgba(0,0,0,.35);
  }
  .leaflet-control-scale-line{
    border:none!important;background:transparent!important;
    font-size:10px!important;color:rgba(255,255,255,.75)!important;
    font-family:-apple-system,BlinkMacSystemFont,sans-serif;
  }

  .leaflet-control-attribution{
    font-size:8px!important;padding:1px 5px!important;
    background:rgba(11,18,32,.55)!important;color:rgba(255,255,255,.55)!important;
    border-radius:0!important;
  }
  .leaflet-control-attribution a{color:rgba(255,255,255,.6)!important}
</style>
</head>
<body class="base-streets">
<div id="map"></div>
<script>
${safeJs}
</script>
<script>
(function() {
function send(msg) {
  if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
    window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
}

if (typeof L === 'undefined') {
  send({ type: 'mapError', message: 'Map library failed to initialize.' });
  document.getElementById('map').innerHTML =
    '<div style="padding:24px;text-align:center;color:#e8eef8;font-family:sans-serif;background:#0B1220;height:100%;display:flex;align-items:center;justify-content:center"><b>Map failed to load</b></div>';
  return;
}

function sanitizeColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#00A8A8';
}

var map = L.map('map', {
  center: [20.5937, 78.9629],
  zoom: 5,
  zoomControl: false,
  attributionControl: true,
  maxBounds: ${JSON.stringify(INDIA_BOUNDS)},
  maxBoundsViscosity: 0.85,
  minZoom: 4,
  maxZoom: 18,
});

/* Streets basemap (Carto Voyager) */
var streetsLayer = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  {
    maxZoom: 19,
    attribution: '&copy; CARTO &copy; OSM',
  }
);
streetsLayer.addTo(map);

L.control.scale({ position: 'bottomleft', metric: true, imperial: false, maxWidth: 120 }).addTo(map);

var markerLayerGroup = L.featureGroup().addTo(map);
var markerDataMap = {};
var markerLeafletMap = {};
var markerBasePositions = {};
var selectedId = null;
var userMarker = null;
var routeLayer = null;
var labelLayout = {};
var labelLayoutKey = '';

function minPriorityForZoom(z) {
  // Zoom 4–7 major, 8–10 popular, 11–13 most places, 14+ all visible markers
  if (z >= 14) return 0;
  if (z >= 11) return 40;
  if (z >= 8) return 70;
  if (z >= 4) return 90;
  return 100;
}

function markerLabelPriority(marker) {
  if (marker.labelPriority != null) return Number(marker.labelPriority) || 0;
  var score = 12;
  var rating = Number(marker.rating) || 0;
  if (rating >= 4.5) score += 30;
  else if (rating >= 4) score += 22;
  else if (rating >= 3.5) score += 14;
  else if (rating >= 3) score += 8;
  if (marker.isCityGroup) score += 55;
  return score;
}

function shouldShowLabelByZoom(marker, zoom) {
  if (selectedId === marker.id) return true;
  return markerLabelPriority(marker) >= minPriorityForZoom(zoom);
}

function boxesOverlap(a, b) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function updateLabelLayout() {
  var zoom = map.getZoom();
  var ids = Object.keys(markerLeafletMap);
  var center = map.getCenter();
  var nextKey = zoom + ':' + selectedId + ':' + ids.length + ':'
    + center.lat.toFixed(3) + ':' + center.lng.toFixed(3);
  if (nextKey === labelLayoutKey) return;
  labelLayoutKey = nextKey;

  var candidates = ids.map(function(id) {
    var marker = markerDataMap[id];
    var leafletMarker = markerLeafletMap[id];
    if (!marker || !leafletMarker) return null;
    var ll = leafletMarker.getLatLng();
    var pt = map.latLngToContainerPoint(ll);
    return {
      id: id,
      marker: marker,
      x: pt.x,
      y: pt.y,
      priority: markerLabelPriority(marker),
    };
  }).filter(function(c) {
    return c && shouldShowLabelByZoom(c.marker, zoom);
  }).sort(function(a, b) {
    if (a.id === selectedId) return -1;
    if (b.id === selectedId) return 1;
    return b.priority - a.priority;
  });

  var placed = [];
  var nextLayout = {};

  candidates.forEach(function(c) {
    var isSelected = c.id === selectedId;
    var w = isSelected ? 128 : 112;
    var h = isSelected ? 56 : (c.marker.distance ? 46 : 38);
    var offsets = isSelected ? [0, -14, 14, -28, 28] : [0, -12, 12];
    var chosen = null;

    for (var i = 0; i < offsets.length; i++) {
      var ox = offsets[i];
      var box = {
        x: c.x - w / 2 + ox,
        y: c.y + 6,
        w: w,
        h: h,
      };
      var hit = placed.some(function(p) { return boxesOverlap(box, p); });
      if (!hit) {
        chosen = { show: true, offsetX: ox };
        placed.push(box);
        break;
      }
    }

    if (!chosen) {
      if (isSelected) {
        chosen = { show: true, offsetX: 0 };
        placed.push({ x: c.x - w / 2, y: c.y + 6, w: w, h: h });
      } else {
        chosen = { show: false, offsetX: 0 };
      }
    }

    nextLayout[c.id] = chosen;
  });

  // Only rebuild icons whose label visibility/offset actually changed (avoids pin blinking).
  var changedIds = [];
  ids.forEach(function(id) {
    var prev = labelLayout[id] || { show: false, offsetX: 0 };
    var next = nextLayout[id] || { show: false, offsetX: 0 };
    if (!!prev.show !== !!next.show || Number(prev.offsetX || 0) !== Number(next.offsetX || 0)) {
      changedIds.push(id);
    }
  });
  // Also refresh selected / previously selected for badge size
  if (selectedId && changedIds.indexOf(selectedId) < 0) changedIds.push(selectedId);

  labelLayout = nextLayout;
  changedIds.forEach(function(id) {
    var m = markerDataMap[id];
    if (m && markerLeafletMap[id]) {
      markerLeafletMap[id].setIcon(createIcon(m, selectedId === id));
    }
  });
}

function emitBounds() {
  var bounds = map.getBounds();
  send({
    type: 'mapBoundsChanged',
    bounds: {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    },
    zoom: map.getZoom(),
  });
}

var boundsEmitTimer = null;
function emitBoundsDebounced() {
  if (boundsEmitTimer) clearTimeout(boundsEmitTimer);
  boundsEmitTimer = setTimeout(emitBounds, 400);
}

setTimeout(function() {
  try { map.invalidateSize(true); } catch (e) {}
  send({ type: 'mapReady' });
  emitBounds();
}, 50);

function escapeHtml(text) {
  if (!text) return '';
  var d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function getCategoryIcon(iconId) {
  var icons = {
    castle:
      '<svg viewBox="0 0 20 20" fill="white">'
      + '<rect x="2" y="8" width="16" height="9" rx="1.5"/>'
      + '<rect x="3.5" y="4.5" width="3" height="4.5" rx="0.8"/>'
      + '<rect x="8.5" y="4.5" width="3" height="4.5" rx="0.8"/>'
      + '<rect x="13.5" y="4.5" width="3" height="4.5" rx="0.8"/>'
      + '<rect x="8" y="10.5" width="4" height="6.5" rx="0.8"/>'
      + '</svg>',

    temple:
      '<svg viewBox="0 0 20 20" fill="white">'
      + '<path d="M3 16V8l7-5 7 5v8H3z"/>'
      + '<rect x="8" y="11" width="4" height="5" rx="0.5"/>'
      + '<polygon points="10,2 12,4 8,4" fill="rgba(255,255,255,0.5)"/>'
      + '</svg>',

    museum:
      '<svg viewBox="0 0 20 20" fill="white">'
      + '<rect x="2" y="13" width="16" height="3.5" rx="1"/>'
      + '<rect x="4" y="8" width="3.5" height="5" rx="0.8"/>'
      + '<rect x="8.25" y="8" width="3.5" height="5" rx="0.8"/>'
      + '<rect x="12.5" y="8" width="3.5" height="5" rx="0.8"/>'
      + '<path d="M2 7.5l8-4.5 8 4.5H2z"/>'
      + '</svg>',

    shop:
      '<svg viewBox="0 0 20 20" fill="white">'
      + '<path d="M3 5h14l-2 11H5L3 5z"/>'
      + '<path d="M7 5V4a3 3 0 0 1 6 0v1" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round"/>'
      + '</svg>',

    mountain:
      '<svg viewBox="0 0 20 20" fill="white">'
      + '<path d="M1 16l5-9 3.5 5 3-4.5 6 8.5H1z"/>'
      + '<circle cx="14.5" cy="5.5" r="2.5" fill="rgba(255,255,255,0.7)"/>'
      + '</svg>',

    waterfall:
      '<svg viewBox="0 0 20 20" fill="white">'
      + '<path d="M4 2v7c0 3 3 4 3 7" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/>'
      + '<path d="M10 2v5c0 3 3 4 3 8" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/>'
      + '<path d="M16 2v3c0 3 2 5 2 10" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/>'
      + '</svg>',

    tree:
      '<svg viewBox="0 0 20 20" fill="white">'
      + '<path d="M10 2L5 9h3L4 16h12L12 9h3L10 2z"/>'
      + '<rect x="9" y="16" width="2" height="2.5" rx="0.5"/>'
      + '</svg>',

    park:
      '<svg viewBox="0 0 20 20" fill="white">'
      + '<circle cx="10" cy="8" r="5"/>'
      + '<rect x="9" y="13" width="2" height="4" rx="0.5"/>'
      + '</svg>',

    lake:
      '<svg viewBox="0 0 20 20" fill="white">'
      + '<path d="M2 10c2-3 4-3 6 0s4 3 6 0s4-3 4 0" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/>'
      + '<path d="M2 14c2-3 4-3 6 0s4 3 6 0s4-3 4 0" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/>'
      + '<circle cx="10" cy="5" r="2.5"/>'
      + '</svg>',

    adventure:
      '<svg viewBox="0 0 20 20" fill="white">'
      + '<polygon points="10,2 18,16 2,16"/>'
      + '<rect x="9" y="9" width="2" height="5" fill="rgba(0,0,0,0.2)"/>'
      + '</svg>',

    wildlife:
      '<svg viewBox="0 0 20 20" fill="white">'
      + '<ellipse cx="10" cy="11" rx="5" ry="4"/>'
      + '<circle cx="7" cy="7" r="2"/>'
      + '<circle cx="13" cy="7" r="2"/>'
      + '</svg>',

    vendor:
      '<svg viewBox="0 0 20 20" fill="white">'
      + '<rect x="2" y="4" width="16" height="4" rx="1.5"/>'
      + '<rect x="3" y="8" width="14" height="9" rx="1"/>'
      + '<rect x="6" y="8" width="3" height="5" rx="0.5"/>'
      + '<rect x="11" y="8" width="3" height="5" rx="0.5"/>'
      + '</svg>',

    default:
      '<svg viewBox="0 0 20 20" fill="white">'
      + '<path d="M10 2C6.7 2 4 4.7 4 8c0 5.5 6 11 6 11s6-5.5 6-11c0-3.3-2.7-6-6-6z"/>'
      + '<circle cx="10" cy="8" r="2.5" fill="rgba(0,0,0,0.25)"/>'
      + '</svg>',
  };
  icons.heritage = icons.castle;
  icons.palace = '<svg viewBox="0 0 20 20" fill="white"><path d="M2 17h16v-3H2v3zM4 13h12V8l-3 2-3-5-3 5-3-2v5z"/><circle cx="10" cy="3" r="1.5"/></svg>';
  icons.river = '<svg viewBox="0 0 20 20" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M2 5c3-2 5 2 8 0s5 2 8 0M2 10c3-2 5 2 8 0s5 2 8 0M2 15c3-2 5 2 8 0s5 2 8 0"/></svg>';
  icons.ghat = '<svg viewBox="0 0 20 20" fill="white"><path d="M3 4h14v3H3zM5 8h10v2H5zM7 11h6v2H7zM2 15h16v2H2z"/></svg>';
  icons.forest = '<svg viewBox="0 0 20 20" fill="white"><path d="M6 2L2 10h2l-3 6h8l-2-4h2L6 2zm8 3l-3 6h2l-2 5h7l-2-4h2l-4-7z"/></svg>';
  icons['national-park'] = '<svg viewBox="0 0 20 20" fill="white"><circle cx="8" cy="7" r="4"/><circle cx="13" cy="9" r="4"/><path d="M9 10v7M13 12v5M4 17h12" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>';
  icons.camping = '<svg viewBox="0 0 20 20" fill="white"><path d="M2 16L10 3l8 13H2zm8-8l-3 6h6l-3-6z"/><path d="M1 17h18" stroke="white" stroke-width="1.5"/></svg>';
  icons.viewpoint = '<svg viewBox="0 0 20 20" fill="none" stroke="white" stroke-width="2"><circle cx="6" cy="10" r="3"/><circle cx="14" cy="10" r="3"/><path d="M9 10h2M3 7L1 5M17 7l2-2M6 13l-2 4M14 13l2 4"/></svg>';
  icons.sun = '<svg viewBox="0 0 20 20" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><circle cx="10" cy="10" r="3"/><path d="M10 1v3M10 16v3M1 10h3M16 10h3M3.6 3.6l2.1 2.1M14.3 14.3l2.1 2.1M16.4 3.6l-2.1 2.1M5.7 14.3l-2.1 2.1"/></svg>';
  icons.food = '<svg viewBox="0 0 20 20" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M5 2v7M2 2v4a3 3 0 0 0 6 0V2M5 9v9M14 2v16M14 2c3 1 3 6 0 7"/></svg>';
  icons.cafe = '<svg viewBox="0 0 20 20" fill="white"><path d="M3 7h11v7a4 4 0 0 1-8 0V7zm11 2h2a2 2 0 0 1 0 4h-2"/><path d="M4 18h11M6 3c0 1 1 1 1 2M10 2c0 1 1 1 1 2" fill="none" stroke="white" stroke-width="1.5"/></svg>';
  icons.shopping = icons.shop;
  icons['art-gallery'] = '<svg viewBox="0 0 20 20" fill="white"><rect x="2" y="3" width="16" height="14" rx="2"/><circle cx="7" cy="8" r="2" fill="rgba(255,255,255,.55)"/><path d="M4 15l4-4 3 3 2-2 3 3H4z" fill="rgba(255,255,255,.55)"/></svg>';
  icons.religious = '<svg viewBox="0 0 20 20" fill="white"><path d="M8 18V9H4l6-7 6 7h-4v9H8z"/><path d="M10 1v3M8.5 2.5h3" stroke="white" stroke-width="1.4"/></svg>';
  icons.beach = '<svg viewBox="0 0 20 20" fill="white"><path d="M10 17V8M10 8C7 4 4 5 3 6M10 8c3-4 6-3 7-2M10 8c-1-4 1-5 2-6M2 17h16" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>';
  icons.desert = '<svg viewBox="0 0 20 20" fill="white"><path d="M1 16l6-7 3 3 3-5 6 9H1z"/><circle cx="5" cy="5" r="2"/></svg>';
  icons.cave = '<svg viewBox="0 0 20 20" fill="white"><path d="M2 17V9l4-6h8l4 6v8H2zm5-1v-4a3 3 0 0 1 6 0v4H7z"/></svg>';
  icons.garden = '<svg viewBox="0 0 20 20" fill="white"><path d="M4 4c7 0 11 4 11 11-7 0-11-4-11-11zm1 13l10-10" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>';
  icons['theme-park'] = '<svg viewBox="0 0 20 20" fill="none" stroke="white" stroke-width="2"><circle cx="10" cy="10" r="6"/><circle cx="10" cy="10" r="1.5" fill="white"/><path d="M10 2v6M18 10h-6M10 18v-6M2 10h6"/></svg>';
  icons.hotel = '<svg viewBox="0 0 20 20" fill="white"><path d="M2 10h16v6H2zM4 5h5v5H4zM2 17v2M18 17v2"/></svg>';
  icons.information = '<svg viewBox="0 0 20 20" fill="white"><circle cx="10" cy="10" r="8"/><rect x="9" y="9" width="2" height="6" rx="1" fill="white"/><circle cx="10" cy="6" r="1.2" fill="white"/></svg>';
  icons.airport = '<svg viewBox="0 0 20 20" fill="white"><path d="M2 11l7-2V3l2-1 1 7 5 2v2l-5-1v5l-2 1-1-6-7 1v-2z"/></svg>';
  icons.train = '<svg viewBox="0 0 20 20" fill="white"><rect x="4" y="2" width="12" height="13" rx="2"/><path d="M7 5h6M7 10h1M12 10h1M6 18l2-3M14 18l-2-3" stroke="white" stroke-width="1.5"/></svg>';
  icons.bus = '<svg viewBox="0 0 20 20" fill="white"><rect x="3" y="3" width="14" height="13" rx="2"/><rect x="5" y="5" width="10" height="5" fill="rgba(255,255,255,.5)"/><circle cx="6" cy="16" r="1.5"/><circle cx="14" cy="16" r="1.5"/></svg>';
  return (icons[iconId] || icons.default).replace(/white/g, 'var(--pin-color)');
}

function buildPin(marker, isSelected, isNew) {
  var color = sanitizeColor(marker.color || '#00A8A8');
  var iconId = marker.emoji || 'default';
  var svgIcon = getCategoryIcon(iconId);
  var isVendor = marker.type === 'vendor';
  var isCluster = marker.type === 'cluster';
  var typeClass = isCluster ? ' cluster-pin' : (isVendor ? ' vendor-pin' : ' place-pin');
  var selected = isSelected ? ' selected' : '';
  var newClass = isNew ? ' is-new' : '';
  var layout = labelLayout[marker.id] || { show: false, offsetX: 0 };
  var showLabel = isSelected || layout.show;
  var labelHidden = showLabel ? '' : ' is-hidden';
  var labelStyle = layout.offsetX ? ' style="transform:translateX(' + layout.offsetX + 'px)"' : '';

  var pinHtml = '<div class="map-pin' + typeClass + selected + newClass + '">'
    + '<div class="pin-badge" style="--pin-color:' + color + '">'
      + '<div class="pin-icon-box">';
  if (isCluster && marker.clusterCount) {
    pinHtml += '<span class="cluster-count">' + escapeHtml(String(marker.clusterCount)) + '</span>';
  } else {
    pinHtml += svgIcon;
  }
  pinHtml += '</div>';
  if (isVendor && marker.offerBadge) {
    pinHtml += '<div class="pin-offer-flag">' + escapeHtml(String(marker.offerBadge)) + '</div>';
  }
  pinHtml += '</div>';

  var distHtml = '';
  if (marker.distance) {
    var distText = isSelected ? marker.distance + ' away' : marker.distance;
    distHtml = '<div class="pin-label-dist">' + escapeHtml(distText) + '</div>';
  }

  var catHtml = '';
  if (isVendor && marker.rating != null && Number(marker.rating) > 0) {
    catHtml = '<div class="pin-label-rating">★ ' + escapeHtml(Number(marker.rating).toFixed(1)) + '</div>';
  } else if (marker.sublabel) {
    catHtml = '<div class="pin-label-cat">' + escapeHtml(marker.sublabel) + '</div>';
  }

  pinHtml += '<div class="pin-label-card' + labelHidden + '"' + labelStyle + '>'
    + '<div class="pin-label-name">' + escapeHtml(marker.name) + '</div>'
    + catHtml
    + distHtml
    + '</div>';

  pinHtml += '</div>';
  return pinHtml;
}

function computeIconSize(isSelected, hasLabel) {
  var pinW = isSelected ? 36 : 32;
  var pinH = isSelected ? 36 : 32;
  var labelH = hasLabel ? (isSelected ? 46 : 38) : 0;
  var w = Math.max(pinW, isSelected ? 108 : 96);
  var h = pinH + labelH + 4;
  return { w: w, h: h, ax: w / 2, ay: pinH + 2 };
}

function createIcon(marker, isSelected, isNew) {
  var layout = labelLayout[marker.id] || { show: false, offsetX: 0 };
  var zoomOk = shouldShowLabelByZoom(marker, map.getZoom());
  var hasLabel = isSelected || (layout.show && zoomOk);
  var html = buildPin(marker, isSelected, !!isNew);
  var sz = computeIconSize(!!isSelected, hasLabel);
  return L.divIcon({
    className: '',
    html: html,
    iconSize: [sz.w, sz.h],
    iconAnchor: [sz.ax, sz.ay],
  });
}

function refreshAllIcons() {
  Object.keys(markerLeafletMap).forEach(function(id) {
    var m = markerDataMap[id];
    if (m) markerLeafletMap[id].setIcon(createIcon(m, selectedId === id));
  });
}

function applyCategoryFanOut() {
  var groups = {};
  Object.keys(markerBasePositions).forEach(function(id) {
    var point = markerBasePositions[id];
    // ~110m cells — only spiderfy truly distinct co-located POIs
    var key = point.lat.toFixed(3) + ':' + point.lng.toFixed(3);
    (groups[key] || (groups[key] = [])).push(id);
  });

  Object.keys(groups).forEach(function(key) {
    var ids = groups[key];
    var base = markerBasePositions[ids[0]];
    if (ids.length === 1) {
      if (markerLeafletMap[ids[0]]) markerLeafletMap[ids[0]].setLatLng([base.lat, base.lng]);
      return;
    }

    ids.sort(function(a, b) {
      var aa = ((markerDataMap[a] && markerDataMap[a].emoji) || '') + a;
      var bb = ((markerDataMap[b] && markerDataMap[b].emoji) || '') + b;
      return aa.localeCompare(bb);
    });
    var center = map.latLngToLayerPoint([base.lat, base.lng]);
    var radius = ids.length <= 6 ? 25 : 34;
    ids.forEach(function(id, index) {
      if (!markerLeafletMap[id]) return;
      var angle = (-Math.PI / 2) + (index * Math.PI * 2 / ids.length);
      var ring = ids.length > 8 && index >= 8 ? 1.55 : 1;
      var display = map.layerPointToLatLng([
        center.x + Math.cos(angle) * radius * ring,
        center.y + Math.sin(angle) * radius * ring,
      ]);
      markerLeafletMap[id].setLatLng(display);
    });
  });
}

function markerSignature(m) {
  return [
    m.id,
    Number(m.lat).toFixed(5),
    Number(m.lng).toFixed(5),
    m.name || '',
    m.category || '',
    m.type || '',
    m.color || '',
    m.emoji || '',
    m.sublabel || '',
    String(m.labelPriority || 0),
  ].join('|');
}
function normPinName(name) {
  // eslint-disable-next-line no-useless-escape
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function pinNamesSimilar(a, b) {
  var na = normPinName(a);
  var nb = normPinName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 6 && nb.length >= 6 && (na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0)) return true;
  var stop = { the:1, and:1, of:1, fort:1, temple:1, park:1, lake:1, falls:1, ghat:1, museum:1, garden:1 };
  var ta = na.split(' ').filter(function(w) { return w.length >= 4 && !stop[w]; });
  var tb = {};
  nb.split(' ').forEach(function(w) { if (w.length >= 4 && !stop[w]) tb[w] = 1; });
  for (var i = 0; i < ta.length; i++) {
    if (tb[ta[i]] && ta[i].length >= 5) return true;
  }
  return false;
}

function haversineKmJs(aLat, aLng, bLat, bLng) {
  var toRad = function(d) { return d * Math.PI / 180; };
  var R = 6371;
  var dLat = toRad(bLat - aLat);
  var dLng = toRad(bLng - aLng);
  var x = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

function preferPin(a, b) {
  var score = function(m) {
    var s = (Number(m.rating) || 0) * 10;
    if (/^c[a-z0-9]{20,}$/i.test(m.id)) s += 25;
    return s;
  };
  return score(a) >= score(b) ? a : b;
}

/** Drop near-duplicate pins that slipped past RN (local seed + API variants). */
function collapseNearDuplicateMarkers(markers) {
  var list = (markers || []).filter(function(m) {
    return m && m.id && m.lat != null && m.lng != null && !isNaN(Number(m.lat)) && !isNaN(Number(m.lng));
  });
  var keep = [];
  list.forEach(function(m) {
    var merged = false;
    for (var i = 0; i < keep.length; i++) {
      var d = haversineKmJs(Number(keep[i].lat), Number(keep[i].lng), Number(m.lat), Number(m.lng));
      if (d <= 0.25 || (d <= 1.5 && pinNamesSimilar(keep[i].name, m.name))) {
        keep[i] = preferPin(keep[i], m);
        merged = true;
        break;
      }
    }
    if (!merged) keep.push(m);
  });
  return keep;
}

function fadeOutAndRemoveMarker(id) {
  var mk = markerLeafletMap[id];
  if (!mk) return;
  var el = mk.getElement && mk.getElement();
  if (el) {
    var pin = el.querySelector('.map-pin');
    if (pin) {
      var data = markerDataMap[id];
      if (data && data.type === 'cluster') pin.classList.add('is-splitting');
      pin.classList.add('is-removing');
    }
    setTimeout(function() {
      try { markerLayerGroup.removeLayer(mk); } catch (e) {}
      delete markerLeafletMap[id];
      delete markerDataMap[id];
      delete markerBasePositions[id];
      delete labelLayout[id];
    }, 280);
  } else {
    try { markerLayerGroup.removeLayer(mk); } catch (e) {}
    delete markerLeafletMap[id];
    delete markerDataMap[id];
    delete markerBasePositions[id];
    delete labelLayout[id];
  }
}

function setMarkers(markers) {
  var next = collapseNearDuplicateMarkers(markers || []);
  var nextIds = {};
  next.forEach(function(m) {
    if (m && m.id) nextIds[m.id] = m;
  });

  // Fade out markers leaving viewport — keep map populated during load
  Object.keys(markerLeafletMap).forEach(function(id) {
    if (!nextIds[id]) fadeOutAndRemoveMarker(id);
  });

  var addedOrMoved = false;
  var prevHadClusters = Object.keys(markerDataMap).some(function(id) {
    return markerDataMap[id] && markerDataMap[id].type === 'cluster';
  });
  var nextHasClusters = next.some(function(m) { return m && m.type === 'cluster'; });

  next.forEach(function(m) {
    if (!m || !m.id || m.lat == null || m.lng == null) return;
    var lat = Number(m.lat);
    var lng = Number(m.lng);
    if (isNaN(lat) || isNaN(lng)) return;

    var existing = markerLeafletMap[m.id];
    var prevSig = markerDataMap[m.id] ? markerSignature(markerDataMap[m.id]) : '';
    var nextSig = markerSignature(m);
    var wasCluster = markerDataMap[m.id] && markerDataMap[m.id].type === 'cluster';
    markerDataMap[m.id] = m;
    markerBasePositions[m.id] = { lat: lat, lng: lng };

    if (!existing) {
      addedOrMoved = true;
      var isSel = selectedId === m.id;
      var mk = L.marker([lat, lng], {
        icon: createIcon(m, isSel, true),
        zIndexOffset: m.type === 'vendor' ? 200 : (isSel ? 100000 : 0),
      });
      mk._markerId = m.id;
      mk.on('click', function() {
        send({ type: 'markerPress', id: m.id, name: m.name, lat: m.lat, lng: m.lng });
      });
      markerLayerGroup.addLayer(mk);
      markerLeafletMap[m.id] = mk;
      if (wasCluster && m.type !== 'cluster') {
        var el = mk.getElement && mk.getElement();
        if (el) {
          var pin = el.querySelector('.map-pin');
          if (pin) pin.classList.add('is-new');
        }
      }
    } else {
      var prevPos = existing.getLatLng();
      if (Math.abs(prevPos.lat - lat) > 0.00001 || Math.abs(prevPos.lng - lng) > 0.00001) {
        existing.setLatLng([lat, lng]);
        addedOrMoved = true;
      }
      if (prevSig !== nextSig) {
        var splitting = wasCluster && m.type === 'cluster' && prevHadClusters && !nextHasClusters;
        existing.setIcon(createIcon(m, selectedId === m.id, splitting));
      }
    }
  });

  if (addedOrMoved) applyCategoryFanOut();
  labelLayoutKey = '';
  updateLabelLayout();
}

function setSelectedMarker(id) {
  if (selectedId && markerLeafletMap[selectedId]) {
    var prev = markerDataMap[selectedId];
    if (prev) markerLeafletMap[selectedId].setIcon(createIcon(prev, false));
    markerLeafletMap[selectedId].setZIndexOffset(prev && prev.type === 'vendor' ? 200 : 0);
  }
  selectedId = id;
  labelLayoutKey = '';
  if (id && markerLeafletMap[id] && markerDataMap[id]) {
    markerLeafletMap[id].setIcon(createIcon(markerDataMap[id], true));
    markerLeafletMap[id].setZIndexOffset(100000);
    updateLabelLayout();
  }
}

function clearSelectedMarker() {
  if (selectedId && markerLeafletMap[selectedId]) {
    var prev = markerDataMap[selectedId];
    if (prev) {
      markerLeafletMap[selectedId].setIcon(createIcon(prev, false));
      markerLeafletMap[selectedId].setZIndexOffset(prev.type === 'vendor' ? 200 : 0);
    }
  }
  selectedId = null;
  labelLayoutKey = '';
  updateLabelLayout();
}

function setUserLocation(lat, lng) {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return;
  if (userMarker) {
    userMarker.setLatLng([lat, lng]);
    userMarker.setZIndexOffset(500000);
  } else {
    userMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'user-location-marker',
        html: '<div class="user-dot"><div class="user-dot-inner"></div></div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      }),
      zIndexOffset: 500000,
      interactive: false,
    }).addTo(map);
  }
  try { userMarker.bringToFront(); } catch (e) {}
}

function panTo(lat, lng) {
  map.panTo([lat, lng], { animate: true, duration: 0.55, easeLinearity: 0.25 });
}

function restoreView(lat, lng, zoom) {
  map.setView([lat, lng], zoom || map.getZoom(), { animate: false });
  emitBounds();
}

function flyTo(lat, lng, zoom) {
  map.flyTo([lat, lng], zoom || 13, { duration: 1.2, easeLinearity: 0.25 });
  setTimeout(function() {
    emitBounds();
    send({ type: 'cameraIdle', zoom: map.getZoom() });
  }, 1250);
}

function fitIndia() {
  map.setView([20.5937, 78.9629], 5, { animate: true });
}

function fitBounds(bounds, maxZoom) {
  if (!bounds || !bounds.length) return;
  var b = L.latLngBounds(bounds);
  map.fitBounds(b, { padding: [48, 48], maxZoom: maxZoom || 13, animate: true, duration: 1.0 });
  setTimeout(function() {
    emitBounds();
    send({ type: 'cameraIdle', zoom: map.getZoom() });
  }, 1100);
}

// Bridge for RN injectJavaScript (more reliable than postMessage on some Android WebViews)
window.__palMap = {
  flyTo: flyTo,
  fitBounds: fitBounds,
  panTo: panTo,
  restoreView: restoreView,
  setView: function(lat, lng, zoom) { map.setView([lat, lng], zoom || 13, { animate: false }); emitBounds(); },
  setUserLocation: setUserLocation,
};

function drawRoute(coords) {
  if (routeLayer) map.removeLayer(routeLayer);
  routeLayer = L.polyline(coords, {
    color: '#00A8A8',
    weight: 6,
    opacity: 0.85,
    lineCap: 'round',
    lineJoin: 'round',
  }).addTo(map);
  map.fitBounds(routeLayer.getBounds(), { padding: [60, 60], animate: true });
}

function clearRoute() {
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
}

var ALLOWED_MESSAGE_TYPES = {
  setMarkers: true,
  setUserLocation: true,
  flyTo: true,
  fitIndia: true,
  fitBounds: true,
  drawRoute: true,
  clearRoute: true,
  zoomIn: true,
  zoomOut: true,
  setSelectedMarker: true,
  clearSelectedMarker: true,
};

function handleMessage(event) {
  var data;
  try {
    var raw = event && event.data;
    data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) { return; }
  if (!data || !data.type || !ALLOWED_MESSAGE_TYPES[data.type]) return;
  switch (data.type) {
    case 'setMarkers':
      setMarkers(data.markers);
      break;
    case 'setUserLocation':
      if (data.lat != null && data.lng != null) setUserLocation(data.lat, data.lng);
      break;
    case 'flyTo':
      if (data.lat != null && data.lng != null) flyTo(data.lat, data.lng, data.zoom);
      break;
    case 'fitIndia':
      fitIndia();
      break;
    case 'fitBounds':
      fitBounds(data.bounds, data.maxZoom);
      break;
    case 'drawRoute':
      if (data.coords && data.coords.length) drawRoute(data.coords);
      break;
    case 'clearRoute':
      clearRoute();
      break;
    case 'zoomIn':
      map.zoomIn();
      break;
    case 'zoomOut':
      map.zoomOut();
      break;
    case 'setSelectedMarker':
      setSelectedMarker(data.id);
      break;
    case 'clearSelectedMarker':
      clearSelectedMarker();
      break;
  }
}

window.addEventListener('message', handleMessage);
document.addEventListener('message', handleMessage);

var labelMoveTimer = null;
function scheduleLabelLayout() {
  if (labelMoveTimer) clearTimeout(labelMoveTimer);
  labelMoveTimer = setTimeout(function() {
    labelLayoutKey = '';
    updateLabelLayout();
  }, 80);
}

map.on('zoomend', function() {
  var z = map.getZoom();
  labelLayoutKey = '';
  applyCategoryFanOut();
  updateLabelLayout();
  send({ type: 'zoomChanged', zoom: z });
});

map.on('moveend', function() {
  scheduleLabelLayout();
  emitBoundsDebounced();
});
})();
</script>
</body>
</html>`;
}
