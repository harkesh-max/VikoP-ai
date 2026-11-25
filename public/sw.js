self.addEventListener("install", event => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "A reminder is due." };
  }

  const title = data.title || "VikoP AI — Reminder due";
  const options = {
    body: data.body || "You have a reminder due.",
    tag: data.reminderId ? `vikop-reminder-${data.reminderId}` : "vikop-reminder",
    renotify: false,
    vibrate: [250, 100, 250],
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    data: { url: data.url || "/" }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(
    event.notification.data?.url || "/",
    self.location.origin
  ).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true
    });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        await client.focus();
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
