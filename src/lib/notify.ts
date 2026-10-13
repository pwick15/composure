/** Browser notifications for the work session, so you hear about it even from another tab. */

const supported = () => typeof window !== 'undefined' && 'Notification' in window

/** Asks once, when a session starts (a key press counts as the user gesture browsers want). */
export function askForNotifications() {
  if (supported() && Notification.permission === 'default') void Notification.requestPermission()
}

export const notificationsBlocked = () => supported() && Notification.permission === 'denied'

export function notify(title: string, body?: string) {
  if (!supported() || Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, tag: 'composure-session' })
  } catch {
    // Some browsers only allow notifications through a service worker; the in-app toast still shows.
  }
}
