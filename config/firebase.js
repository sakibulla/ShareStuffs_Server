const admin = require("firebase-admin");

const firebaseConfig = {
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"), // ← THIS LINE
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
};

if (!admin.apps.length) {
    admin.initializeApp(firebaseConfig);
}

module.exports = admin;