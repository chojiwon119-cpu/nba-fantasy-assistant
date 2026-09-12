const REQUEST = 'NBA_ASSISTANT_REQUEST_SYNC';
const RESPONSE = 'NBA_ASSISTANT_SYNC_STATE';
const MATCH_REQUEST = 'NBA_ASSISTANT_MATCH_REQUEST';
const MATCH_RESPONSE = 'NBA_ASSISTANT_MATCH_RESPONSE';
const MAX_PLAYERS = 60;

window.addEventListener('message', async (event) => {
  if (event.source !== window || !event.data) return;

  if (event.data.type === REQUEST) {
    const state = await chrome.storage.local.get([
      'latestYahooSnapshots',
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
      },
    }, window.location.origin);
    return;
  }

  if (event.data.type === MATCH_REQUEST) {
    const players = Array.isArray(event.data.payload?.players) ? event.data.payload.players.slice(0, MAX_PLAYERS) : [];
    chrome.runtime.sendMessage(
      { type: 'NBA_ASSISTANT_MATCH_PLAYERS', payload: { players } },
      (response) => {
        if (chrome.runtime.lastError) {
          window.postMessage({
            type: MATCH_RESPONSE,
            payload: { collectedAt: new Date().toISOString(), matches: [], games: [], gameStats: [], errors: ['background_unavailable'] },
          }, window.location.origin);
          return;
        }
        window.postMessage({
          type: MATCH_RESPONSE,
          payload: response?.payload || { collectedAt: new Date().toISOString(), matches: [], games: [], gameStats: [], errors: ['empty_response'] },
        }, window.location.origin);
      },
    );
  }
});

window.postMessage({
  type: RESPONSE,
  payload: { installed: true, bridgeReady: true },
}, window.location.origin);
