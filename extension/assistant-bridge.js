const REQUEST = 'NBA_ASSISTANT_REQUEST_SYNC';
const RESPONSE = 'NBA_ASSISTANT_SYNC_STATE';

window.addEventListener('message', async (event) => {
  if (event.source !== window || event.data?.type !== REQUEST) return;

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
});

window.postMessage({
  type: RESPONSE,
  payload: { installed: true, bridgeReady: true },
}, window.location.origin);

