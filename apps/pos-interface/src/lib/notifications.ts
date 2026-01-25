/**
 * Browser Notifications Utility
 * Handles permission requests and notification display
 */

export type NotificationPermission = "granted" | "denied" | "default";

/**
 * Check if browser supports notifications
 */
export function isNotificationSupported(): boolean {
  return "Notification" in window;
}

/**
 * Get current notification permission status
 */
export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) {
    return "denied";
  }
  return Notification.permission;
}

/**
 * Request notification permission from user
 * @returns Promise with permission result
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) {
    console.warn("Browser does not support notifications");
    return "denied";
  }

  // If already granted, return immediately
  if (Notification.permission === "granted") {
    return "granted";
  }

  // If already denied, don't request again
  if (Notification.permission === "denied") {
    console.warn("Notification permission was previously denied");
    return "denied";
  }

  // Request permission
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (error) {
    console.error("Error requesting notification permission:", error);
    return "denied";
  }
}

/**
 * Show a browser notification
 * @param title - Notification title
 * @param options - Notification options
 */
export function showNotification(
  title: string,
  options?: {
    body?: string;
    tag?: string;
    requireInteraction?: boolean;
  }
): Notification | null {
  if (!isNotificationSupported()) {
    console.warn("Browser does not support notifications");
    return null;
  }

  if (Notification.permission !== "granted") {
    console.warn("Notification permission not granted");
    return null;
  }

  try {
    const notification = new Notification(title, {
      body: options?.body,
      tag: options?.tag,
      requireInteraction: options?.requireInteraction ?? false,
    });

    // Auto-close after 5 seconds if not requireInteraction
    if (!options?.requireInteraction) {
      setTimeout(() => {
        notification.close();
      }, 5000);
    }

    return notification;
  } catch (error) {
    console.error("Error showing notification:", error);
    return null;
  }
}

/**
 * Show fatoura completion notification
 * @param fatouraNumber - The fatoura number that was assigned
 */
export function showFatouraNotification(fatouraNumber: number): Notification | null {
  return showNotification("Fatoura Ready!", {
    body: `Your order fatoura #${fatouraNumber} has been assigned successfully`,
    tag: `fatoura-${fatouraNumber}`,
    requireInteraction: false,
  });
}
