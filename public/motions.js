/* Game motion / cutscene system (Mafia42-style) */
const MOTION_ASSET_VERSION = '4';

const MOTION_SCENES = {
  vote_execution: '/assets/motions/vote_execution.png',
  vote_rejected: '/assets/motions/vote_rejected.png',
  vote_tie: '/assets/motions/vote_rejected.png',
  quiet_night: '/assets/motions/quiet_night.png',
  mafia_kill: '/assets/motions/mafia_kill.png',
  doctor_heal: '/assets/motions/doctor_heal.png',
  soldier_block: '/assets/motions/soldier_block.png',
  police_mafia: '/assets/motions/police_mafia.png',
  police_innocent: '/assets/motions/police_innocent.png',
  spy_contact: '/assets/motions/spy_contact.png',
  spy_investigate: '/assets/motions/spy_investigate.png',
  madam_silence: '/assets/motions/madam_silence.png',
  politician_immunity: '/assets/motions/politician_immunity.png',
  reporter_scoop: '/assets/motions/reporter_scoop.png',
  graverobber_inherit: '/assets/motions/graverobber_inherit.png',
  cult_proselytize: '/assets/motions/cult_proselytize.svg'
};

const MOTION_SCENE_FALLBACK_SVG = {
  cult_proselytize: '/assets/motions/cult_proselytize.svg'
};

function motionSceneUrl(type) {
  const base = MOTION_SCENES[type] || MOTION_SCENES.quiet_night;
  return base + '?v=' + MOTION_ASSET_VERSION;
}

function motionSceneFallback(type) {
  const svg = MOTION_SCENE_FALLBACK_SVG[type];
  return svg ? svg + '?v=' + MOTION_ASSET_VERSION : motionSceneUrl('quiet_night');
}

let motionQueue = [];
let motionPlaying = false;

function motionEscapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function enqueueMotion(data) {
  if (!data || !data.type) return;
  motionQueue.push(data);
  if (!motionPlaying) playNextMotion();
}

function clearMotionQueue() {
  motionQueue = [];
  motionPlaying = false;
  const overlay = document.getElementById('motion-overlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  overlay.hidden = true;
  overlay.innerHTML = '';
}

function playNextMotion() {
  if (!motionQueue.length) {
    motionPlaying = false;
    return;
  }
  motionPlaying = true;
  showGameMotion(motionQueue.shift()).then(() => playNextMotion());
}

function showGameMotion(data) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('motion-overlay');
    if (!overlay) return resolve();

    const scene = motionSceneUrl(data.type);
    const fallback = motionSceneFallback(data.type);
    overlay.innerHTML =
      '<div class="motion-panel">' +
      '<div class="motion-header">' + motionEscapeHtml(data.title || '') + '</div>' +
      '<div class="motion-scene"><img src="' + scene + '" alt="" onerror="this.onerror=null;this.src=\'' + fallback + '\'"></div>' +
      '<div class="motion-message">' + motionEscapeHtml(data.message || '') + '</div>' +
      '<div class="motion-situation">' + motionEscapeHtml(data.situation || '') + '</div>' +
      '<button type="button" class="btn btn-secondary motion-close">확인</button>' +
      '</div>';

    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('active'));

    const done = () => {
      overlay.classList.remove('active');
      setTimeout(() => {
        overlay.hidden = true;
        overlay.innerHTML = '';
        resolve();
      }, 280);
    };

    const btn = overlay.querySelector('.motion-close');
    if (btn) btn.addEventListener('click', done, { once: true });
    setTimeout(done, data.duration || 3400);
  });
}
