const Request = require("../models/Request");
const User = require("../models/User");
const Item = require("../models/Item"); // must be required so Mongoose registers it for populate()

// Lazy-initialize Stripe so a missing/placeholder key doesn't crash the server on startup
let _stripe = null;
function getStripe() {
    if (!_stripe) {
        const key = process.env.STRIPE_SECRET_KEY;
        if (!key || key.startsWith("sk_test_...")) {
            throw new Error("STRIPE_SECRET_KEY is not configured. Add your real Stripe secret key to server/.env");
        }
        _stripe = require("stripe")(key);
    }
    return _stripe;
}

/**
 * POST /api/payments/create-checkout-session
 * Creates a Stripe Checkout session for the deposit of a request.
 */
const createCheckoutSession = async (req, res) => {
    try {
        const stripe = getStripe();
        const { requestId } = req.body;
        if (!requestId) {
            return res.status(400).json({ message: "requestId is required" });
        }

        const request = await Request.findById(requestId)
            .populate("item", "title images deposit dailyFee")
            .populate("lender", "name")
            .populate("borrower", "name email");

        if (!request) {
            return res.status(404).json({ message: "Request not found" });
        }

        if (request.borrower._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "Only the borrower can pay for this request" });
        }

        if (request.paymentStatus === "paid") {
            return res.status(400).json({ message: "This request has already been paid" });
        }

        const depositAmount = request.item.deposit || 0;
        if (depositAmount <= 0) {
            return res.status(400).json({ message: "No deposit required for this item" });
        }

        const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "payment",
            customer_email: request.borrower.email,
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: {
                            name: `Deposit for: ${request.item.title}`,
                            description: `Security deposit for borrowing "${request.item.title}" from ${request.lender.name}`,
                        },
                        unit_amount: Math.round(depositAmount * 100),
                    },
                    quantity: 1,
                },
            ],
            metadata: {
                requestId: request._id.toString(),
                borrowerId: request.borrower._id.toString(),
                lenderId: request.lender._id.toString(),
                depositAmount: depositAmount.toString(),
                itemTitle: request.item.title,
            },
            success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${clientUrl}/payment/cancel?request_id=${request._id}`,
        });

        request.stripeSessionId = session.id;
        request.depositAmount = depositAmount;
        await request.save();

        return res.status(200).json({ url: session.url, sessionId: session.id });
    } catch (error) {
        console.error("Stripe checkout error:", error.message, error.stack);
        return res.status(500).json({ message: error.message });
    }
};

/**
 * POST /api/payments/webhook
 * Stripe webhook — marks request as paid and credits the lender.
 */
const handleWebhook = async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
        const stripe = getStripe();
        if (webhookSecret && !webhookSecret.startsWith("whsec_your_")) {
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } else {
            event = JSON.parse(req.body.toString());
        }
    } catch (err) {
        console.error("Webhook error:", err.message);
        return res.status(400).json({ message: `Webhook Error: ${err.message}` });
    }

    if (event.type === "checkout.session.completed") {
        await fulfillPayment(event.data.object);
    }

    return res.status(200).json({ received: true });
};

/**
 * GET /api/payments/verify?session_id=xxx
 * Called by the success page to confirm payment.
 */
const verifyPayment = async (req, res) => {
    try {
        const stripe = getStripe();
        const { session_id } = req.query;
        if (!session_id) {
            return res.status(400).json({ message: "session_id is required" });
        }

        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status === "paid") {
            await fulfillPayment(session);

            const request = await Request.findOne({ stripeSessionId: session_id })
                .populate("item", "title images")
                .populate("lender", "name")
                .populate("borrower", "name");

            return res.status(200).json({ paid: true, request });
        }

        return res.status(200).json({ paid: false });
    } catch (error) {
        console.error("Verify payment error:", error.message);
        return res.status(500).json({ message: error.message });
    }
};

/**
 * GET /api/payments/history
 * Returns the authenticated user's payment history and total earned.
 */
const getPaymentHistory = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select("paymentHistory totalEarned");
        if (!user) return res.status(404).json({ message: "User not found" });
        return res.status(200).json({
            totalEarned: user.totalEarned || 0,
            paymentHistory: user.paymentHistory || [],
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// ─── Internal helper ────────────────────────────────────────────────────────

async function fulfillPayment(session) {
    const { requestId, lenderId, depositAmount, itemTitle } = session.metadata || {};
    if (!requestId) return;

    const request = await Request.findById(requestId);
    if (!request || request.paymentStatus === "paid") return;

    const amount = parseFloat(depositAmount) || 0;

    request.paymentStatus = "paid";
    await request.save();

    await User.findByIdAndUpdate(lenderId, {
        $inc: { totalEarned: amount },
        $push: {
            paymentHistory: {
                requestId: request._id,
                itemTitle: itemTitle || "Unknown item",
                amount,
                paidAt: new Date(),
                type: "received",
            },
        },
    });

    await User.findByIdAndUpdate(request.borrower, {
        $push: {
            paymentHistory: {
                requestId: request._id,
                itemTitle: itemTitle || "Unknown item",
                amount,
                paidAt: new Date(),
                type: "paid",
            },
        },
    });
}

module.exports = { createCheckoutSession, handleWebhook, verifyPayment, getPaymentHistory };
