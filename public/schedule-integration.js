(() => {
  if (window.__t2wScheduleIntegrationLoaded) return;
  window.__t2wScheduleIntegrationLoaded = true;

  const selectionCache = {};
  const detailCache = {};
  let lastScheduleLink = null;
  let lastScheduleWarning = null;

  const METHOD_TEXT = {
    METRES: 'Metres drive schedule progress',
    ASSETS: 'Ticked mapped assets drive schedule progress',
    MANUAL: 'Planner/manual progress',
    MILESTONE: 'Yes/no milestone',
  };

  function keyFor(tab) {
    const date = document.getElementById('fDate')?.value || T2W.todayISO();
    return `${date}|${tab.id}`;
  }

  function currentPosition(tab) {
    try {
      const sec = sectionOf(tab.section);
      const crew = sec.crews.find((c) => c.crew === tab.crew);
      const trench = Number(crew.tracks.trench.position || 0);
      const pipe = Number(crew.tracks.pipe.position || 0);
      if (tab.crew === 'trenchless') return pipe || trench;
      return Math.max(trench, pipe);
    } catch (_) {
      return 0;
    }
  }

  function selectedId(tab) {
    const k = keyFor(tab);
    if (selectionCache[k]) return selectionCache[k];
    try {
      const saved = localStorage.getItem('t2w.schedule.' + k);
      if (saved) selectionCache[k] = saved;
    } catch (_) {}
    return selectionCache[k] || '';
  }

  function setSelected(tab, id) {
    const k = keyFor(tab);
    selectionCache[k] = id || '';
    try {
      if (id) localStorage.setItem('t2w.schedule.' + k, id);
      else localStorage.removeItem('t2w.schedule.' + k);
    } catch (_) {}
  }

  function fmtDate(v) {
    if (!v) return '';
    const d = new Date(v + 'T00:00:00');
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function pct(v) {
    return Number(v || 0).toFixed(1) + '%';
  }

  function activityOption(a) {
    const ch = a.chainageFromM != null && a.chainageToM != null
      ? ` · ${T2W.num(a.chainageFromM)} to ${T2W.num(a.chainageToM)} m` : '';
    const dates = a.plannedStart ? ` · ${fmtDate(a.plannedStart)} to ${fmtDate(a.plannedFinish)}` : '';
    return `${a.activityId} · ${a.activityName}${ch}${dates}`;
  }

  function detailHtml(a) {
    if (!a) return '<div class="count">Choose the schedule activity this crew is working on.</div>';
    const ch = a.chainageFromM != null && a.chainageToM != null
      ? `${T2W.num(a.chainageFromM)} m to ${T2W.num(a.chainageToM)} m` : 'Not chainage based';
    const assetText = a.assetCount
      ? `${a.assetComplete} of ${a.assetCount} mapped assets complete`
      : 'No mapped point assets';
    const variance = a.varianceDays == null ? ''
      : a.varianceDays === 0 ? 'On baseline finish'
      : a.varianceDays > 0 ? `${a.varianceDays} day(s) forecast late`
      : `${Math.abs(a.varianceDays)} day(s) forecast early`;
    return `
      <div class="schedule-detail-grid">
        <div><span>Method</span><b>${T2W.esc(a.method)}</b><small>${T2W.esc(METHOD_TEXT[a.method] || '')}</small></div>
        <div><span>Planned chainage</span><b>${T2W.esc(ch)}</b><small>${T2W.esc(a.progressTrack ? 'Progress track: ' + a.progressTrack : '')}</small></div>
        <div><span>Baseline</span><b>${T2W.esc(fmtDate(a.plannedStart))}</b><small>Finish ${T2W.esc(fmtDate(a.plannedFinish))}</small></div>
        <div><span>Live progress</span><b>${pct(a.percentComplete)}</b><small>Planned by now ${pct(a.plannedPercent)}</small></div>
        <div><span>Assets</span><b>${T2W.esc(assetText)}</b><small>${T2W.esc(a.costCode ? 'Cost code ' + a.costCode : 'Cost code not mapped')}</small></div>
        <div><span>Forecast</span><b>${T2W.esc(a.status)}</b><small>${T2W.esc(variance || (a.forecastFinish ? 'Forecast ' + fmtDate(a.forecastFinish) : ''))}</small></div>
      </div>`;
  }

  async function enhanceScheduleSelector() {
    const tab = TABS.find((t) => t.id === active);
    const host = document.getElementById('crewPanel');
    if (!tab || !host || tab.kind !== 'crew' || host.querySelector('.schedule-activity-card')) return;

    const card = document.createElement('div');
    card.className = 'schedule-activity-card';
    card.innerHTML = `
      <div class="schedule-activity-title">
        <div><strong>Activity plan</strong><small>Connect this EOD to the baseline schedule</small></div>
        <a href="/schedule.html">Open live schedule</a>
      </div>
      <div class="field" style="margin-top:10px">
        <label>Schedule activity</label>
        <select id="scheduleActivitySelect"><option value="">Loading relevant activities...</option></select>
      </div>
      <div id="scheduleActivityDetail" class="schedule-activity-detail"></div>`;
    host.insertAdjacentElement('afterbegin', card);

    const date = document.getElementById('fDate')?.value || T2W.todayISO();
    const ch = currentPosition(tab);
    const params = new URLSearchParams({ section: tab.section, crew: tab.crew, date, chainage: String(ch) });
    let rows = [];
    try {
      rows = await T2W.api('/schedule/activities?' + params.toString());
    } catch (err) {
      card.querySelector('#scheduleActivitySelect').innerHTML = '<option value="">Could not load schedule activities</option>';
      card.querySelector('#scheduleActivityDetail').innerHTML = `<div class="msg err">${T2W.esc(err.message)}</div>`;
      return;
    }

    rows.forEach((r) => { detailCache[r.activityId] = r; });
    let chosen = selectedId(tab);
    if (!chosen && rows.length && Number(rows[0].score || 0) >= 80) {
      chosen = rows[0].activityId;
      setSelected(tab, chosen);
    }

    const select = card.querySelector('#scheduleActivitySelect');
    select.innerHTML = '<option value="">Choose activity...</option>' + rows.map((a) =>
      `<option value="${T2W.esc(a.activityId)}">${T2W.esc(activityOption(a))}</option>`).join('');
    if (chosen && rows.some((r) => r.activityId === chosen)) select.value = chosen;

    const detail = card.querySelector('#scheduleActivityDetail');
    detail.innerHTML = detailHtml(detailCache[select.value]);
    select.addEventListener('change', () => {
      setSelected(tab, select.value);
      detail.innerHTML = detailHtml(detailCache[select.value]);
    });
  }

  const originalRenderPanel = renderPanel;
  renderPanel = async function (...args) {
    const result = await originalRenderPanel.apply(this, args);
    await enhanceScheduleSelector();
    return result;
  };

  const originalApi = T2W.api.bind(T2W);
  T2W.api = async function (path, opts = {}) {
    if (path !== '/crews/save-day' || String(opts.method || '').toUpperCase() !== 'POST') {
      return originalApi(path, opts);
    }

    const baseResult = await originalApi(path, opts);
    const body = opts.body || {};
    const selections = [];
    const assetLinks = [];

    for (const tab of TABS.filter((t) => t.kind === 'crew')) {
      const activityId = selectedId(tab);
      if (!activityId) continue;
      const detail = detailCache[activityId] || {};
      selections.push({
        section: tab.section,
        crew: tab.crew,
        activityId,
        track: detail.progressTrack || null,
      });
      const rows = newGround[tab.id] || [];
      for (const row of rows) {
        if (ticked[row.recordKey]) assetLinks.push({ activityId, recordKey: row.recordKey });
      }
    }

    const uniqueAssets = [];
    const seen = new Set();
    for (const x of assetLinks) {
      const k = `${x.activityId}|${x.recordKey}`;
      if (seen.has(k)) continue;
      seen.add(k);
      uniqueAssets.push(x);
    }

    lastScheduleLink = null;
    lastScheduleWarning = null;
    if (selections.length) {
      try {
        lastScheduleLink = await originalApi('/schedule/eod-link', { method: 'POST', body: {
          date: body.date,
          selections,
          moves: baseResult.moves || [],
          assetLinks: uniqueAssets,
          notes: body.notes || '',
        } });
      } catch (err) {
        lastScheduleWarning = err.message;
      }
    }
    return baseResult;
  };

  const originalSaveDay = saveDay;
  saveDay = async function (...args) {
    await originalSaveDay.apply(this, args);
    const ok = document.querySelector('#msg .msg.ok');
    if (ok && lastScheduleLink) {
      const n = (lastScheduleLink.linked || []).length;
      const assets = (lastScheduleLink.linked || []).reduce((s, r) => s + Number(r.assets || 0), 0);
      ok.insertAdjacentHTML('beforeend', `<br>Schedule updated: ${n} activity link(s), ${assets} asset link(s). Live Gantt recalculated.`);
    } else if (ok && lastScheduleWarning) {
      ok.insertAdjacentHTML('beforeend', `<br><strong>Schedule warning:</strong> ${T2W.esc(lastScheduleWarning)}`);
    }
  };

  const style = document.createElement('style');
  style.textContent = `
    .schedule-activity-card{background:#f5f8fb;border:1px solid #cfd9e5;border-radius:9px;padding:14px;margin:0 0 16px}
    .schedule-activity-title{display:flex;justify-content:space-between;align-items:center;gap:12px}
    .schedule-activity-title strong{display:block;font-size:15px}.schedule-activity-title small{display:block;color:var(--muted);margin-top:2px}
    .schedule-activity-title a{font-size:12px;text-decoration:none;color:var(--brand-dark);font-weight:600}
    .schedule-activity-detail{margin-top:10px}.schedule-detail-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .schedule-detail-grid>div{background:#fff;border:1px solid var(--line);border-radius:7px;padding:9px}
    .schedule-detail-grid span,.schedule-detail-grid small{display:block;color:var(--muted);font-size:11px}.schedule-detail-grid b{display:block;font-size:13px;margin:3px 0}
    @media(max-width:900px){.schedule-detail-grid{grid-template-columns:1fr 1fr}}
  `;
  document.head.appendChild(style);
})();
