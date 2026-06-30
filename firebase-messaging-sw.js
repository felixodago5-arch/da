importScripts('https://www.gstatic.com/firebasejs/11.0.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.1/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyAh0JpM0BqgCwxkhFG32m6VH6okQIiSops",
    authDomain: "felix-portfolio-8b3a8.firebaseapp.com",
    projectId: "felix-portfolio-8b3a8",
    storageBucket: "felix-portfolio-8b3a8.firebasestorage.app",
    messagingSenderId: "439075265698",
    appId: "1:439075265698:web:058c014a4f4c32a9444bfb"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
    const title = payload.notification?.title || 'Felix James';
    const options = {
        body: payload.notification?.body || '',
        icon: '/assets/image/192.png',
        badge: '/assets/image/192.png',
        data: payload.data || {}
    };
    self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const url = event.notification.data?.url || '/da/index.html';
    event.waitUntil(clients.openWindow(url));
});
