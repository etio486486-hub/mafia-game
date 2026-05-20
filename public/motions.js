/* Game motion / cutscene system (Mafia42-style) */
const MOTION_ASSET_VERSION = '8';

const MOTION_TYPES = [
  'vote_execution', 'vote_rejected', 'vote_tie', 'quiet_night', 'mafia_kill',
  'doctor_heal', 'soldier_block', 'police_mafia', 'police_innocent',
  'spy_contact', 'spy_investigate', 'madam_silence', 'politician_immunity',
  'reporter_scoop', 'graverobber_inherit', 'cult_proselytize', 'private_detective_search'
];

function motionTypeKey(type) {
  if (type === 'vote_tie') return 'vote_rejected';
  return MOTION_TYPES.includes(type) ? type : 'quiet_night';
}

/** 기존 PNG 일러스트 우선, 없으면 SVG */
function motionScenePngUrl(type) {
  const key = motionTypeKey(type);
  return `/assets/motions/${key}.png?v=${MOTION_ASSET_VERSION}`;
}

function motionSceneSvgUrl(type) {
  const key = motionTypeKey(type);
  return `/assets/motions/${key}.svg?v=${MOTION_ASSET_VERSION}`;
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
  if (typeof window.enqueuePresentation === 'function') {
    window.enqueuePresentation(() => showGameMotion(data), `motion:${data.type}`);
    return;
  }
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

    const scenePng = motionScenePngUrl(data.type);
    const sceneSvg = motionSceneSvgUrl(data.type);
    overlay.innerHTML =
      '<div class="motion-panel">' +
      '<div class="motion-header">' + motionEscapeHtml(data.title || '') + '</div>' +
      '<div class="motion-scene"><img id="motion-scene-img" src="" alt=""></div>' +
      '<div class="motion-message">' + motionEscapeHtml(data.message || '') + '</div>' +
      '<div class="motion-situation">' + motionEscapeHtml(data.situation || '') + '</div>' +
      '<button type="button" class="btn btn-secondary motion-close">확인</button>' +
      '</div>';

    overlay.hidden = false;
    const img = overlay.querySelector('#motion-scene-img');
    if (img) {
      img.decoding = 'async';
      img.onerror = () => {
        if (!img.dataset.fallback) {
          img.dataset.fallback = 'svg';
          img.src = sceneSvg;
          return;
        }
        img.alt = data.title || data.type || 'scene';
      };
      img.onload = () => {
        if (img.dataset.logged) return;
        img.dataset.logged = '1';
      };
      img.src = scenePng;
    }
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
    setTimeout(done, data.duration || 4200);
  });
}
