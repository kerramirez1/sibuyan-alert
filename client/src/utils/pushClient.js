export function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeUserToPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.log("Push not supported");
    return null;
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  console.log("SW registered:", registration);

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    console.log("Push permission denied");
    return null;
  }

  const vapidRes = await fetch("/api/push/vapid-public-key").then((res) => res.json());
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidRes.publicKey),
  });

  return subscription;
}
