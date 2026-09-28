export const environment = {
  production: false,
  firebase: {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT.firebaseapp.com',
    projectId: 'YOUR_PROJECT',
    storageBucket: 'YOUR_PROJECT.appspot.com',
    messagingSenderId: 'YOUR_SENDER_ID',
    appId: 'YOUR_APP_ID'
  },
  // These are the editable defaults used on the bill entry form.
  // Change them here any time your standard rate/discount/TDS changes.
  defaults: {
    rate: 90,          // per liter
    discountPct: 0,    // %
    tdsPct: 1           // %  (placeholder — confirm actual TDS % with Claude/your accountant)
  }
};
