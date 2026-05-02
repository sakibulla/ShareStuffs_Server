const express = require("express");
const { register, login, firebaseLogin, getMe } = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/firebase-login", firebaseLogin);
router.get("/me", authMiddleware, getMe);

module.exports = router;
