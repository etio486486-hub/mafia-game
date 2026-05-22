/**
 * 낮/밤 전환·투표 결과·모션·공지 팝업을 순서대로 재생 (동시에 겹쳐 사라지는 문제 방지)
 */
(function () {
  const queue = [];
  let busy = false;

  function drain() {
    if (busy || !queue.length) return;
    busy = true;
    const job = queue.shift();
    Promise.resolve()
      .then(() => (typeof job === 'function' ? job() : job.run()))
      .catch(() => {})
      .finally(() => {
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
