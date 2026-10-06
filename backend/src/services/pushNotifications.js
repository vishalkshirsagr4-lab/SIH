import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription.js';

// Configure web-push with VAPID keys
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (!vapidPublicKey || !vapidPrivateKey) {
  console.warn('⚠️  VAPID keys not configured. Push notifications will not work.');
} else {
  webpush.setVapidDetails(
    `mailto:${process.env.ADMIN_EMAIL || 'admin@parlour.com'}`,
    vapidPublicKey,
    vapidPrivateKey
  );
}

/**
 * Send a push notification to a specific user
 * @param {string} userId - MongoDB User ID
 * @param {object} notificationData - Notification payload
 * @returns {Promise<void>}
 */
export const sendPushNotificationToUser = async (userId, notificationData) => {
  try {
    console.debug(`[Push] Looking for active subscription for user: ${userId}`);
    
    const subscription = await PushSubscription.findOne({ user: userId, isActive: true });

    if (!subscription) {
      console.warn(`[Push] ⚠️  No active push subscription found for user: ${userId}`);
      
      // Check if subscription exists but is inactive
      const inactiveSubscription = await PushSubscription.findOne({ user: userId });
      if (inactiveSubscription) {
        console.warn(`[Push] → Subscription exists but marked isActive: ${inactiveSubscription.isActive}`);
      }
      
      return;
    }

    console.debug(`[Push] Found subscription for user: ${userId}`);

    const payload = JSON.stringify({
      title: notificationData.title,
      body: notificationData.body,
      icon: notificationData.icon || '/icons/icon-192.svg',
      badge: notificationData.badge || '/icons/badge-72.svg',
      tag: notificationData.tag || 'default',
      data: notificationData.data || {},
      actions: notificationData.actions || [],
    });

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        auth: subscription.auth,
        p256dh: subscription.p256dh,
      },
    };

    await webpush.sendNotification(pushSubscription, payload);

    // Update last used timestamp
    subscription.lastUsed = new Date();
    await subscription.save();

    console.log(`✓ [Push] Notification sent to user: ${userId}`);
  } catch (error) {
    if (error.statusCode === 410) {
      // Subscription endpoint is no longer valid
      console.warn(`[Push] Subscription expired for user: ${userId}, marking as inactive`);
      await PushSubscription.findOneAndUpdate(
        { user: userId },
        { isActive: false }
      );
    } else {
      console.error(`[Push] Error sending notification to user ${userId}:`, error.message);
    }
  }
};

/**
 * Send push notification to multiple users
 * @param {string[]} userIds - Array of MongoDB User IDs
 * @param {object} notificationData - Notification payload
 * @returns {Promise<object>} - Results object with success and failed counts
 */
export const sendPushNotificationToUsers = async (userIds, notificationData) => {
  const results = {
    success: 0,
    failed: 0,
    total: userIds.length,
  };

  const promises = userIds.map(async (userId) => {
    try {
      await sendPushNotificationToUser(userId, notificationData);
      results.success++;
    } catch (error) {
      results.failed++;
      console.error(`Failed to send notification to user ${userId}:`, error.message);
    }
  });

  await Promise.all(promises);
  return results;
};

/**
 * Send booking-related notifications
 */
export const sendBookingNotification = async (userId, bookingData, notificationType) => {
  const notificationMessages = {
    created: {
      title: '📅 Booking Confirmed',
      body: `Your appointment for ${bookingData.serviceName} is confirmed for ${bookingData.date}`,
      icon: '/icons/icon-192.svg',
      data: {
        type: 'booking-created',
        bookingId: bookingData.bookingId,
        date: bookingData.date,
      },
    },
    confirmed: {
      title: '✅ Booking Confirmed',
      body: `Your booking for ${bookingData.serviceName} has been confirmed by the salon`,
      icon: '/icons/icon-192.svg',
      data: {
        type: 'booking-confirmed',
        bookingId: bookingData.bookingId,
      },
    },
    reminder: {
      title: '⏰ Appointment Reminder',
      body: `Don't forget! Your appointment is coming up on ${bookingData.date}`,
      icon: '/icons/icon-192.svg',
      data: {
        type: 'booking-reminder',
        bookingId: bookingData.bookingId,
      },
    },
    completed: {
      title: '🎉 Appointment Completed',
      body: `Your appointment for ${bookingData.serviceName} has been completed`,
      icon: '/icons/icon-192.svg',
      data: {
        type: 'booking-completed',
        bookingId: bookingData.bookingId,
      },
    },
    cancelled: {
      title: '❌ Booking Cancelled',
      body: `Your booking for ${bookingData.serviceName} has been cancelled`,
      icon: '/icons/icon-192.svg',
      data: {
        type: 'booking-cancelled',
        bookingId: bookingData.bookingId,
      },
    },
  };

  const notification = notificationMessages[notificationType];
  if (!notification) {
    throw new Error(`Unknown notification type: ${notificationType}`);
  }

  await sendPushNotificationToUser(userId, notification);
};

/**
 * Send promotional notifications to users
 */
export const sendPromoNotification = async (userIds, promoData) => {
  const notification = {
    title: promoData.title || '🎉 Special Offer',
    body: promoData.body || 'Check out our latest promotions',
    icon: promoData.icon || '/icons/icon-192.svg',
    data: {
      type: 'promotion',
      promoId: promoData.promoId,
      link: promoData.link || '/',
    },
  };

  return sendPushNotificationToUsers(userIds, notification);
};

/**
 * Get VAPID public key for frontend
 */
export const getVapidPublicKey = () => {
  return vapidPublicKey;
};