/* RelLens — service worker.
 * RelLens only touches a page when the user asks: by clicking the toolbar icon (the popup starts the scan)
 * or by pressing the keyboard shortcut (handled here). It has no access to any site otherwise.
 * Toolbar badge = how many external links on the tab are not plain follow links.
 */
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "relh-counts" || !sender.tab) return;
  const c = msg.counts || {};
  const n = (c.nofollow || 0) + (c.ugc || 0) + (c.sponsored || 0);
  const text = msg.enabled === false || n === 0 ? "" : n > 999 ? "999+" : String(n);
  chrome.action.setBadgeText({ tabId: sender.tab.id, text });
  chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: "#d93a32" });
  if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ tabId: sender.tab.id, color: "#ffffff" });
});

// Shortcut: first press scans the page, later presses turn the highlights off and on.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "toggle-highlights" || !tab || tab.id == null) return;
  chrome.tabs.sendMessage(tab.id, { type: "relh-get" }, (resp) => {
    if (chrome.runtime.lastError || !resp) {
      chrome.storage.local.set({ enabled: true }, () => {
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }).catch(() => {});
      });
      return;
    }
    chrome.storage.local.get({ enabled: true }, (s) => chrome.storage.local.set({ enabled: !s.enabled }));
  });
});
