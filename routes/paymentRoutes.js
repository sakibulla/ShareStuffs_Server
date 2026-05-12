const express = require("express");
const {
    createCheckoutSession,
    handleWebhook,
    verifyPayment,
    getPaymentHistory,
} = require("../controllers/paymentController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Stripe webhook — must use raw body, so it's registered in server.js before express.json()
// This route is just a placeholder; the actual webhook is mounted in server.js
router.post("/webhook", express.raw({ type: "application/json" }), handleWebhook);

// Authenticated routes
router.post("/create-checkout-session", authMiddleware, createCheckoutSession);
router.get("/verify", authMiddleware, verifyPayment);
router.get("/history", authMiddleware, getPaymentHistory);

module.exports = router;
