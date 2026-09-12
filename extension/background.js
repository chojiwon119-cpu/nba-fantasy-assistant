chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    companionVersion: '0.1.0',
    readOnly: true,
  });
});

