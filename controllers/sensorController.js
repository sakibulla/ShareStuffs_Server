const crypto = require("crypto");
const SensorDevice = require("../models/SensorDevice");
const SensorEvent = require("../models/SensorEvent");
const Request = require("../models/Request");

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Classify raw sensor readings into an event type + severity.
 * Thresholds are tunable — these match typical MPU-6050 / ADXL345 behaviour.
 */
function classifyReading({ accelerationG, tiltDeg, temperatureC, batteryPct }) {
    // Fall: free-fall is ~0g, followed by impact >3g — we detect the impact here
    if (accelerationG !== null && accelerationG >= 3.5) {
        return { eventType: "fall", severity: "critical", note: `Impact detected: ${accelerationG.toFixed(2)}g` };
    }
    if (accelerationG !== null && accelerationG >= 2.0) {
        return { eventType: "shock", severity: "warning", note: `Shock detected: ${accelerationG.toFixed(2)}g` };
    }
    if (tiltDeg !== null && Math.abs(tiltDeg) >= 75) {
        return { eventType: "tilt", severity: "warning", note: `Tilt angle: ${tiltDeg.toFixed(1)}°` };
    }
    if (temperatureC !== null && temperatureC >= 60) {
        return { eventType: "overheat", severity: "critical", note: `Temperature: ${temperatureC.toFixed(1)}°C` };
    }
    if (batteryPct !== null && batteryPct <= 15) {
        return { eventType: "low_battery", severity: "warning", note: `Battery: ${batteryPct}%` };
    }
    return { eventType: "heartbeat", severity: "info", note: "All readings normal" };
}

/**
 * Derive overall device condition from the latest event severity.
 */
function deriveCondition(severity) {
    if (severity === "critical") return "critical";
    if (severity === "warning") return "warning";
    return "good";
}

// ── Controller actions ────────────────────────────────────────────────────────

/**
 * POST /api/sensors/devices
 * Lender registers a new sensor device for one of their items.
 * Body: { label, deviceId, itemId }
 */
const registerDevice = async (req, res) => {
    try {
        const { label, deviceId, itemId } = req.body;
        if (!label || !deviceId || !itemId) {
            return res.status(400).json({ message: "label, deviceId, and itemId are required" });
        }

        const existing = await SensorDevice.findOne({ deviceId });
        if (existing) {
            return res.status(409).json({ message: "A device with this ID is already registered" });
        }

        // Generate a secure API key the physical device will use
        const apiKey = crypto.randomBytes(32).toString("hex");

        const device = await SensorDevice.create({
            label,
            deviceId,
            apiKey,
            item: itemId,
            owner: req.user._id,
        });

        // Return the apiKey once — the lender must flash it onto the hardware
        res.status(201).json({ ...device.toObject(), apiKey });
    } catch (error) {
        console.error("registerDevice error:", error);
        res.status(500).json({ message: "Failed to register device" });
    }
};

/**
 * GET /api/sensors/devices
 * Returns all sensor devices owned by the authenticated user.
 */
const getMyDevices = async (req, res) => {
    try {
        const devices = await SensorDevice.find({ owner: req.user._id })
            .populate("item", "title images")
            .populate("activeRequest", "status startDate endDate")
            .sort({ createdAt: -1 });
        res.json(devices);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch devices" });
    }
};

/**
 * GET /api/sensors/devices/:deviceId/events
 * Returns recent events for a device (last 100).
 * Auth: owner of the device OR borrower on the active request.
 */
const getDeviceEvents = async (req, res) => {
    try {
        const device = await SensorDevice.findOne({ deviceId: req.params.deviceId });
        if (!device) return res.status(404).json({ message: "Device not found" });

        const isOwner = device.owner.toString() === req.user._id.toString();
        const isActiveBorrower =
            device.activeRequest &&
            (await Request.findOne({
                _id: device.activeRequest,
                borrower: req.user._id,
            }));

        if (!isOwner && !isActiveBorrower) {
            return res.status(403).json({ message: "Access denied" });
        }

        const events = await SensorEvent.find({ device: device._id })
            .sort({ createdAt: -1 })
            .limit(100);

        res.json({ device, events });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch events" });
    }
};

/**
 * GET /api/sensors/request/:requestId
 * Returns sensor data for a specific rental request.
 * Accessible by lender or borrower of that request.
 */
const getRequestSensorData = async (req, res) => {
    try {
        const request = await Request.findById(req.params.requestId);
        if (!request) return res.status(404).json({ message: "Request not found" });

        const isParticipant =
            request.lender.toString() === req.user._id.toString() ||
            request.borrower.toString() === req.user._id.toString();

        if (!isParticipant) return res.status(403).json({ message: "Access denied" });

        const device = await SensorDevice.findOne({ item: request.item })
            .populate("item", "title images");

        if (!device) {
            return res.json({ device: null, events: [], hasDevice: false });
        }

        const events = await SensorEvent.find({ request: request._id })
            .sort({ createdAt: -1 })
            .limit(200);

        res.json({ device, events, hasDevice: true });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch sensor data" });
    }
};

/**
 * POST /api/sensors/telemetry
 * *** Called by the physical IoT device (NOT by a logged-in user) ***
 * Authenticated via X-Device-Id + X-Api-Key headers.
 *
 * Body: { accelerationG?, tiltDeg?, temperatureC?, batteryPct? }
 *
 * The device should POST this every ~30 seconds during an active rental,
 * or immediately on detecting a shock/fall via interrupt.
 */
const ingestTelemetry = async (req, res) => {
    try {
        const deviceId = req.headers["x-device-id"];
        const apiKey = req.headers["x-api-key"];

        if (!deviceId || !apiKey) {
            return res.status(401).json({ message: "X-Device-Id and X-Api-Key headers required" });
        }

        const device = await SensorDevice.findOne({ deviceId, apiKey, active: true });
        if (!device) {
            return res.status(401).json({ message: "Invalid device credentials" });
        }

        const { accelerationG = null, tiltDeg = null, temperatureC = null, batteryPct = null } = req.body;

        const { eventType, severity, note } = classifyReading({
            accelerationG,
            tiltDeg,
            temperatureC,
            batteryPct,
        });

        const event = await SensorEvent.create({
            device: device._id,
            item: device.item,
            request: device.activeRequest || null,
            accelerationG,
            tiltDeg,
            temperatureC,
            batteryPct,
            eventType,
            severity,
            note,
        });

        // Update device condition + lastSeen
        const newCondition = deriveCondition(severity);
        // Only escalate condition, never silently downgrade on a single heartbeat
        const conditionPriority = { good: 0, warning: 1, critical: 2 };
        const shouldUpdate =
            conditionPriority[newCondition] >= conditionPriority[device.condition] ||
            eventType === "heartbeat";

        await SensorDevice.findByIdAndUpdate(device._id, {
            lastSeen: new Date(),
            ...(shouldUpdate ? { condition: newCondition } : {}),
        });

        // Broadcast via Socket.io to the lender's personal room and the request room
        const io = req.app.get("io");
        if (io) {
            const payload = { event, deviceId, condition: newCondition };
            io.to(`user:${device.owner.toString()}`).emit("sensor_event", payload);
            if (device.activeRequest) {
                io.to(`request:${device.activeRequest.toString()}`).emit("sensor_event", payload);
            }
        }

        res.status(201).json({ received: true, eventType, severity });
    } catch (error) {
        console.error("ingestTelemetry error:", error);
        res.status(500).json({ message: "Failed to ingest telemetry" });
    }
};

/**
 * POST /api/sensors/devices/:deviceId/link
 * Link a sensor device to an active request (called by lender when handing over item).
 * Body: { requestId }
 */
const linkDeviceToRequest = async (req, res) => {
    try {
        const { requestId } = req.body;
        const device = await SensorDevice.findOne({
            deviceId: req.params.deviceId,
            owner: req.user._id,
        });
        if (!device) return res.status(404).json({ message: "Device not found" });

        const request = await Request.findOne({ _id: requestId, lender: req.user._id, status: "accepted" });
        if (!request) return res.status(404).json({ message: "Accepted request not found" });

        device.activeRequest = requestId;
        device.condition = "good"; // reset on new rental
        await device.save();

        res.json({ message: "Device linked to request", device });
    } catch (error) {
        res.status(500).json({ message: "Failed to link device" });
    }
};

/**
 * POST /api/sensors/devices/:deviceId/unlink
 * Unlink device from its current request (called when item is returned).
 */
const unlinkDevice = async (req, res) => {
    try {
        const device = await SensorDevice.findOne({
            deviceId: req.params.deviceId,
            owner: req.user._id,
        });
        if (!device) return res.status(404).json({ message: "Device not found" });

        device.activeRequest = null;
        await device.save();

        res.json({ message: "Device unlinked", device });
    } catch (error) {
        res.status(500).json({ message: "Failed to unlink device" });
    }
};

/**
 * POST /api/sensors/simulate
 * *** DEMO ONLY — remove in production ***
 * Simulates a sensor event for a given deviceId without needing real hardware.
 * Body: { deviceId, scenario: "heartbeat"|"shock"|"fall"|"tilt"|"overheat"|"low_battery" }
 */
const simulateEvent = async (req, res) => {
    try {
        const { deviceId, scenario = "heartbeat" } = req.body;
        const device = await SensorDevice.findOne({ deviceId });
        if (!device) return res.status(404).json({ message: "Device not found" });

        const scenarios = {
            heartbeat:  { accelerationG: 1.0,  tiltDeg: 2,   temperatureC: 28, batteryPct: 85 },
            shock:      { accelerationG: 2.5,  tiltDeg: 10,  temperatureC: 29, batteryPct: 84 },
            fall:       { accelerationG: 4.2,  tiltDeg: 90,  temperatureC: 29, batteryPct: 83 },
            tilt:       { accelerationG: 1.1,  tiltDeg: 80,  temperatureC: 28, batteryPct: 82 },
            overheat:   { accelerationG: 1.0,  tiltDeg: 3,   temperatureC: 72, batteryPct: 70 },
            low_battery:{ accelerationG: 1.0,  tiltDeg: 2,   temperatureC: 27, batteryPct: 10 },
        };

        const readings = scenarios[scenario] || scenarios.heartbeat;
        const { eventType, severity, note } = classifyReading(readings);

        const event = await SensorEvent.create({
            device: device._id,
            item: device.item,
            request: device.activeRequest || null,
            ...readings,
            eventType,
            severity,
            note,
        });

        await SensorDevice.findByIdAndUpdate(device._id, {
            lastSeen: new Date(),
            condition: deriveCondition(severity),
        });

        const io = req.app.get("io");
        if (io) {
            const payload = { event, deviceId, condition: deriveCondition(severity) };
            io.to(`user:${device.owner.toString()}`).emit("sensor_event", payload);
            if (device.activeRequest) {
                io.to(`request:${device.activeRequest.toString()}`).emit("sensor_event", payload);
            }
        }

        res.status(201).json({ simulated: true, event });
    } catch (error) {
        res.status(500).json({ message: "Simulation failed" });
    }
};

module.exports = {
    registerDevice,
    getMyDevices,
    getDeviceEvents,
    getRequestSensorData,
    ingestTelemetry,
    linkDeviceToRequest,
    unlinkDevice,
    simulateEvent,
};
