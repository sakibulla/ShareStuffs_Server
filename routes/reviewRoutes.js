const express = require("express");
const { createReview, getReviewsByUser } = require("../controllers/reviewController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", authMiddleware, createReview);
router.get("/user/:userId", getReviewsByUser);

module.exports = router;
