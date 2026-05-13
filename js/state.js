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
let mode          = 'path'; // 'path' | 'tl' | 'zone-poly' | 'zone-rect' | 'pan' | 'cal'
let activeContext = 'tl';   // 'tl' | 'zones'

let isPanning     = false;
let panStart      = null;
let isDrawingPath = false;
let draggingTL    = null;
let dragOff       = null;
let draggingPoint = null;   // { tlIdx, point }

// --- Display toggles ---
let showMap    = true;
let showZones  = true;
let showAngles = true;
let showPath   = true;

// --- Traffic lights ---
let trafficLights    = [];
let selectedIdx      = null;
let tlShowingDefault = false;
let _defaultTLSnap   = null;

// --- Paths ---
// Multiple named paths: { id, name, color, points[] }
let paths          = [];
let activePathId   = null;   // which path is being drawn
let drawingPathNow = false;  // mouse-drag flag

// Legacy single-path alias (kept for backward compat with old canvas handlers)
// Redirected in simulation.js
let pathPoints = [];

// --- Simulation ---
let simRunning    = false;
let simLastTime   = 0;       // DOMHighResTimeStamp for delta-time

// cars[]: active vehicle instances
// { id, pathId, seg, t, pos, angle, speed, state, inZone, color, name, fines, braking }
// state: 'running' | 'waiting' | 'done'
let cars = [];
let nextCarId = 0;

// TL live phase state (driven by real time during sim)
// tlPhase[i] = { status, timer }
let tlPhase = [];

// Legacy single-car aliases (still used by drawCar / old log checks)
let carPos    = null;
let carAngle  = 0;
let carInZone = {};

// --- Log ---
let logEntries = [];

// --- Zones ---
let zones            = [];
let selectedZoneIdx  = null;
let drawingZone      = null;
let greenZonesLoaded = false;
let GREEN_ZONES_DATA = [];

// --- Calibration ---
let calPoints    = [];
let calActiveIdx = null;
