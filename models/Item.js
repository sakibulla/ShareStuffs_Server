const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            required: true,
            trim: true,
        },
        category: {
            type: String,
            required: true,
            enum: ["Tools", "Camping", "Party", "Kitchen", "Electronics", "Sports"],
        },
        images: {
            type: [String],
            default: [],
        },
        dailyFee: {
            type: Number,
            default: 0,
        },
        deposit: {
            type: Number,
            default: 0,
        },
        available: {
            type: Boolean,
            default: true,
        },
        location: {
            type: String,
            default: "",
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Item", itemSchema);
