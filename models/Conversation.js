const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
    {
        participants: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                required: true,
            },
        ],
        // Optional link to a rental request for context
        request: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Request",
            default: null,
        },
        lastMessage: {
            type: String,
            default: "",
        },
        lastMessageAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

// Ensure a pair of participants only has one conversation per request (or one
// general conversation when request is null).
conversationSchema.index({ participants: 1, request: 1 });

module.exports = mongoose.model("Conversation", conversationSchema);
