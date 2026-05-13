// ============================================================
// STATE — all shared mutable state and read-only constants
// ============================================================

// --- Canvas ---
const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');

// --- GTA SA map constants ---
const MAP_SIZE_PX = 6144;
const MAP_HALF    = MAP_SIZE_PX / 2;

// --- TL status display ---
const COLORS = {
  GREEN:       '#3db76a',
  YELLOW:      '#e8a020',
  RED:         '#d95555',
  YELLOW_RED:  '#e07832',
};
const STATUS_LABEL = {
  GREEN:       'Зелёный',
  YELLOW:      'Жёлтый',
  RED:         'Красный',
  YELLOW_RED:  'Жёлт(кр)',
};

// --- Zone palette ---
const ZONE_COLORS = ['#4caf50','#2196f3','#ff9800','#e91e63','#9c27b0','#00bcd4','#ffeb3b','#ff5722'];

// --- localStorage keys ---
const STORAGE = {
  MAP_CAL:  'tl_map_cal',
  TL_LIST:  'tl_traffic_lights',
  ZONES:    'tl_user_zones',
};

// --- Viewport ---
let viewX     = -500;
let viewY     = -500;
let viewScale = 0.5;

// --- Interaction ---
let mode          = 'tl'; // 'tl' | 'zone-poly' | 'zone-rect' | 'pan' | 'cal'
let activeContext = 'tl';   // 'tl' | 'zones'

let isPanning     = false;
let panStart      = null;
let draggingTL    = null;
let dragOff       = null;
let draggingPoint = null;   // { tlIdx, point }

// --- Display toggles ---
let showMap    = true;
let showZones  = true;
let showAngles = true;

// --- Traffic lights ---
let trafficLights    = [];
let selectedIdx      = null;
let tlShowingDefault = false;
let _defaultTLSnap   = null;

// --- Zones ---
let zones            = [];
let selectedZoneIdx  = null;
let drawingZone      = null;
let greenZonesLoaded = false;
let GREEN_ZONES_DATA = [];

// --- Calibration ---
let calPoints    = [];
let calActiveIdx = null;
