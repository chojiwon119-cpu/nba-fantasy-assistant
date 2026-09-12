const REQUEST = 'NBA_ASSISTANT_REQUEST_SYNC';
const RESPONSE = 'NBA_ASSISTANT_SYNC_STATE';
const SCHEDULE_REQUEST = 'NBA_ASSISTANT_SCHEDULE_REQUEST';
const SCHEDULE_RESPONSE = 'NBA_ASSISTANT_SCHEDULE_RESPONSE';
const MAX_TEAMS = 30;

window.addEventListener('message', async (event) => {
  if (event.source !== window || !event.data) return;

  if (event.data.type === REQUEST) {
    const state = await chrome.storage.local.get([
      'latestYahooSnapshots',
      'yahooPlayerDirectories',
      'lastYahooSyncAt',
      'companionVersion',
      'readOnly',
    ]);

    window.postMessage({
      type: RESPONSE,
      payload: {
        installed: true,
        readOnly: state.readOnly === true,
        version: state.companionVersion || '0.1.0',
        lastSyncAt: state.lastYahooSyncAt || null,
        snapshots: state.latestYahooSnapshots || [],
        playerDirectories: state.yahooPlayerDirectories || {},
      },
    }, window.location.origin);
    return;
  }

  if (event.data.type === SCHEDULE_REQUEST) {
    const payload = event.data.payload || {};
    const teams = Array.isArray(payload.teams) ? payload.teams.slice(0, MAX_TEAMS) : [];
    chrome.runtime.sendMessage(
      { type: SCHEDULE_REQUEST, payload: { teams, startDate: payload.startDate, endDate: payload.endDate } },
      (response) => {
        if (chrome.runtime.lastError) {
          window.postMessage({
            type: SCHEDULE_RESPONSE,
            payload: { gamesByTeam: {}, scheduleCoverage: null, errors: ['background_unavailable'] },
          }, window.location.origin);
          return;
        }
        window.postMessage({
          type: SCHEDULE_RESPONSE,
          payload: response?.payload || { gamesByTeam: {}, scheduleCoverage: null, errors: ['empty_response'] },
        }, window.location.origin);
      },
    );
  }
});

window.postMessage({
  type: RESPONSE,
  payload: { installed: true, bridgeReady: true },
}, window.location.origin);
