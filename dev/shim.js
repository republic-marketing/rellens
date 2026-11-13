/* Dev only: a stand-in for the chrome.* extension API so content.js and the
   popup can run on a plain local page (dev/test.html). Not loaded by the extension. */
(() => {
  const store = {};
  const msgListeners = [];
  const changeListeners = [];
  const stub = {
    __dev: { store, counts: null },
    runtime: {
      id: "dev",
      lastError: undefined,
      sendMessage(msg) { if (msg && msg.type === "relh-counts") stub.__dev.counts = msg; },
      onMessage: { addListener: (fn) => msgListeners.push(fn) }
    },
    storage: {
      local: {
        get(defaults, cb) { cb({ ...defaults, ...store }); },
        set(patch) {
          const changes = {};
          for (const k in patch) { changes[k] = { oldValue: store[k], newValue: patch[k] }; store[k] = patch[k]; }
          setTimeout(() => changeListeners.forEach((fn) => fn(changes, "local")), 0);
        }
      },
      onChanged: { addListener: (fn) => changeListeners.push(fn) }
    },
    tabs: {
      query(q, cb) { cb([{ id: 1 }]); },
      sendMessage(id, msg, cb) { msgListeners.forEach((fn) => fn(msg, {}, cb || (() => {}))); }
    }
  };
  window.chrome = stub;
  window.__chromeStub = stub;
})();
