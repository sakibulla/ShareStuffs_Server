const mongoose = require("mongoose");

/**
 * A single telemetry reading pushed by the physical sensor.
 * Covers: shock/fall detection, tilt, temperature, battery level.
 */
const sensorEventSchema = new mongoose.Schema(
    {
        device: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SensorDevice",
            required: true,
        },
        item: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Item",
            required: true,
        },
        // Linked rental — null for events outside an active rental
        request: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Request",
            default: null,
        },
        // ── Sensor readings ──────────────────────────────────────────────────
        // Acceleration magnitude in g-force (1g = normal, >2g = shock)
        accelerationG: {
            type: Number,
            default: null,
        },
        // Tilt angle in degrees from vertical (0 = upright)
        tiltDeg: {
            type: Number,
            default: null,
        },
        // Ambient temperature in °C
        temperatureC: {
            type: Number,
            default: null,
        },
        // Battery percentage 0-100
        batteryPct: {
            type: Number,
            default: null,
        },
        // ── Derived event classification ─────────────────────────────────────
        eventType: {
            type: String,
            enum: [
                "heartbeat",   // routine check-in, all normal
                "shock",       // sudden impact detected
                "fall",        // free-fall then impact
                "tilt",        // item tilted beyond threshold
                "overheat",    // temperature too high
                "low_battery", // battery below 15%
            ],
            required: true,
        },
        severity: {
            type: String,
            enum: ["info", "warning", "critical"],
            default: "info",
        },
        // Optional note from the classification logic
        note: {
            type: String,
            default: "",
        },
    },
    { timestamps: true }
);

// Index for fast per-device and per-request queries
sensorEventSchema.index({ device: 1, createdAt: -1 });
sensorEventSchema.index({ request: 1, createdAt: -1 });

module.exports = mongoose.model("SensorEvent", sensorEventSchema);
