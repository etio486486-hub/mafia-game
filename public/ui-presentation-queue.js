/**
 * 낮/밤 전환·투표 결과·모션·공지 팝업을 순서대로 재생 (동시에 겹쳐 사라지는 문제 방지)
 */
(function () {
  const queue = [];
  let busy = false;

  function logPresentation(step, data) {
    fetch('http://127.0.0.1:7270/ingest/50c123a2-bf7d-4c65-ba87-3da2632b748d', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'a38a8e' },
      body: JSON.stringify({
        sessionId: 'a38a8e',
        hypothesisId: 'PopupQueue',
        location: 'public/ui-presentation-queue.js',
        message: step,
        data: { ...data, qlen: queue.length, busy },
        timestamp: Date.now()
      })
    }).catch(() => {});
  }

  function drain() {
    if (busy || !queue.length) return;
    busy = true;
    const job = queue.shift();
    const label = job && job._label ? job._label : 'job';
    logPresentation('start', { label });
    Promise.resolve()
      .then(() => (typeof job === 'function' ? job() : job.run()))
      .catch(() => {})
      .finally(() => {
        logPresentation('done', { label });
        busy = false;
        drain();
      });
  }

  window.enqueuePresentation = function (job, label) {
    if (typeof job !== 'function') return;
    job._label = label || 'anon';
    queue.push(job);
    drain();
  };

  window.isPresentationBusy = function () {
    return busy || queue.length > 0;
  };

  window.clearPresentationQueue = function () {
    queue.length = 0;
    busy = false;
  };
})();
