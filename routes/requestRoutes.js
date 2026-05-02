const express = require("express");
const {
    createRequest,
    getMyRequests,
    getLenderRequests,
    updateRequestStatus,
} = require("../controllers/requestController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", authMiddleware, createRequest);
router.get("/mine", authMiddleware, getMyRequests);
router.get("/lender", authMiddleware, getLenderRequests);
router.put("/:id", authMiddleware, updateRequestStatus);

module.exports = router;
