export function pushSupported(config) {
  return !!config.VAPID_PUBLIC_KEY && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
export function isIosNotInstalled() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return ios && !navigator.standalone && !matchMedia("(display-mode: standalone)").matches;
}
function urlBase64ToUint8Array(b64) {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
export async function currentSubscription() {
  const reg = await navigator.serviceWorker.ready; return reg.pushManager.getSubscription();
}
export async function subscribePush(config) {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications were not allowed.");
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.VAPID_PUBLIC_KEY) });
}
