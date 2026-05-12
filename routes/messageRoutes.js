const express = require("express");
const {
    getConversations,
    getOrCreateConversation,
    getMessages,
    sendMessage,
    getUnreadCount,
} = require("../controllers/messageController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// All message routes require authentication
router.use(authMiddleware);

router.get("/conversations", getConversations);
router.post("/conversations", getOrCreateConversation);
router.get("/conversations/:conversationId", getMessages);
router.post("/conversations/:conversationId", sendMessage);
router.get("/unread-count", getUnreadCount);

module.exports = router;
