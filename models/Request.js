const mongoose = require("mongoose");

const requestSchema = new mongoose.Schema(
    {
        item: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Item",
            required: true,
        },
        borrower: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        lender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
        actualReturnDate: {
            type: Date,
            default: null,
        },
        status: {
            type: String,
            enum: ["pending", "accepted", "rejected", "delivered", "returned"],
            default: "pending",
        },
        totalFee: {
            type: Number,
            default: 0,
        },
        depositAmount: {
            type: Number,
            default: 0,
        },
        paymentStatus: {
            type: String,
            enum: ["unpaid", "paid", "refunded"],
            default: "unpaid",
        },
        stripeSessionId: {
            type: String,
            default: null,
        },
        // Refund tracking
        refundAmount: {
            type: Number,
            default: 0,
        },
        refundReason: {
            type: String,
            default: null,
        },
        refundedAt: {
            type: Date,
            default: null,
        },
        // Late return penalty
        latePenalty: {
            type: Number,
            default: 0,
        },
        daysLate: {
            type: Number,
            default: 0,
        },
        penaltyAppliedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Request", requestSchema);
