const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        password: {
            type: String,
            default: null,
        },
        firebaseUID: {
            type: String,
            default: null,
        },
        avatar: {
            type: String,
            default: "",
        },
        phone: {
            type: String,
            default: "",
            trim: true,
        },
        location: {
            type: String,
            default: "",
            trim: true,
        },
        bio: {
            type: String,
            default: "",
            trim: true,
            maxlength: 280,
        },
        role: {
            type: String,
            enum: ["lender", "borrower", "both"],
            default: "both",
        },
        rating: {
            type: Number,
            default: 0,
        },
        totalReviews: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("User", userSchema);
