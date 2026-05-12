const mongoose = require("mongoose");

/**
 * Represents a physical IoT sensor attached to a borrowed item.
 * The lender registers the device once; it gets linked to a Request
 * when the item is borrowed.
 */
const sensorDeviceSchema = new mongoose.Schema(
    {
        // Human-readable label, e.g. "Sensor-001"
        label: {
            type: String,
            required: true,
            trim: true,
        },
        // Unique hardware identifier (MAC address or custom ID flashed onto the device)
        deviceId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        // Secret token the physical device uses to authenticate POST requests
        apiKey: {
            type: String,
            required: true,
        },
        // The item this sensor is permanently assigned to
        item: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Item",
            required: true,
        },
        // Owner of the item (lender)
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        // Currently active rental this sensor is tracking (null when idle)
        activeRequest: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Request",
            default: null,
        },
        // Overall condition derived from latest telemetry
        condition: {
            type: String,
            enum: ["good", "warning", "critical"],
            default: "good",
        },
        lastSeen: {
            type: Date,
            default: null,
        },
        active: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("SensorDevice", sensorDeviceSchema);
