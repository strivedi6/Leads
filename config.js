// ─────────────────────────────────────────────────────────────
// The only file you need to edit after setup (see SETUP.md).
// ─────────────────────────────────────────────────────────────
window.LEADS_CONFIG = {
  // Paste the Web app URL from Apps Script (Deploy ▸ Manage deployments). Leave empty to run the demo.
  API_URL: 'https://script.google.com/macros/s/AKfycbxZ9i0IQDOdqb5WiT32AbCHQe81FUjMU9EKn3oJzpCKG622Qx-2mhKpbNBS1wFx2gdr/exec',

  // OneSignal App ID for push notifications (optional; leave empty until you set up OneSignal).
  ONESIGNAL_APP_ID: '',

  // Shown under the app name.
  SUBTITLE: 'DXBAI · Events & Weddings',

  // Working hours – outside these (and on weekends) the "take a breath" message appears.
  WORK_START_HOUR: 8,   // 8:00 AM
  WORK_END_HOUR: 19,    // 7:00 PM
  WEEKEND_DAYS: [6, 0]  // Saturday, Sunday
};
