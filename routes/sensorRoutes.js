const express = require("express");
const {
    registerDevice,
    getMyDevices,
    getDeviceEvents,
    getRequestSensorData,
    ingestTelemetry,
    linkDeviceToRequest,
    unlinkDevice,
    simulateEvent,
} = require("../controllers/sensorController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// ── Device-to-server telemetry (no JWT — uses X-Device-Id + X-Api-Key) ──────
router.post("/telemetry", ingestTelemetry);

// ── All routes below require a logged-in user ────────────────────────────────
router.use(authMiddleware);

// Device management (lender)
router.post("/devices", registerDevice);
router.get("/devices", getMyDevices);
router.post("/devices/:deviceId/link", linkDeviceToRequest);
router.post("/devices/:deviceId/unlink", unlinkDevice);

// Event history
router.get("/devices/:deviceId/events", getDeviceEvents);
router.get("/request/:requestId", getRequestSensorData);

// Demo simulator
router.post("/simulate", simulateEvent);

module.exports = router;
