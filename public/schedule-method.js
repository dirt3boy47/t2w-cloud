(() => {
  if (window.__t2wScheduleMethodLoaded) return;
  window.__t2wScheduleMethodLoaded = true;

  document.addEventListener('click', async (event) => {
    const pill = event.target.closest('.method-pill');
    if (!pill) return;
    const row = pill.closest('[data-id]');
    const activityId = row && row.dataset.id;
    if (!activityId) return;

    const current = pill.textContent.trim().toUpperCase();
    const entered = prompt('Progress method: METRES, ASSETS, MANUAL or MILESTONE', current);
    if (entered === null) return;
    const method = entered.trim().toUpperCase();
    if (!['METRES','ASSETS','MANUAL','MILESTONE'].includes(method)) {
      alert('Choose METRES, ASSETS, MANUAL or MILESTONE.');
      return;
    }

    let track = null;
    if (method === 'METRES') {
      const enteredTrack = prompt('Which EOD progress track drives this activity: pipe or trench?', 'pipe');
      if (enteredTrack === null) return;
      track = enteredTrack.trim().toLowerCase();
      if (!['pipe','trench'].includes(track)) {
        alert('Choose pipe or trench.');
        return;
      }
    }

    try {
      await T2W.api('/schedule/method/' + encodeURIComponent(activityId), { method:'PUT', body:{
        method, track, asOf:document.getElementById('asOf')?.value || T2W.todayISO()
      }});
      if (typeof load === 'function') await load();
    } catch (err) {
      alert(err.message);
    }
  });
})();
