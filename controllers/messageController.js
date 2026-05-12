const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const User = require("../models/User");

/**
 * GET /api/messages/conversations
 * Returns all conversations for the authenticated user, sorted by most recent.
 */
const getConversations = async (req, res) => {
    try {
        const conversations = await Conversation.find({
            participants: req.user._id,
        })
            .populate("participants", "name avatar email")
            .populate("request", "item status")
            .sort({ lastMessageAt: -1 });

        res.json(conversations);
    } catch (error) {
        console.error("getConversations error:", error);
        res.status(500).json({ message: "Failed to fetch conversations" });
    }
};

/**
 * POST /api/messages/conversations
 * Find or create a conversation between the current user and another user.
 * Body: { recipientId, requestId? }
 */
const getOrCreateConversation = async (req, res) => {
    try {
        const { recipientId, requestId } = req.body;

        if (!recipientId) {
            return res.status(400).json({ message: "recipientId is required" });
        }

        if (recipientId === req.user._id.toString()) {
            return res.status(400).json({ message: "Cannot message yourself" });
        }

        const recipient = await User.findById(recipientId).select("name avatar email");
        if (!recipient) {
            return res.status(404).json({ message: "Recipient not found" });
        }

        // Build query — participants must contain both users (order-independent)
        const query = {
            participants: { $all: [req.user._id, recipientId] },
            request: requestId || null,
        };

        let conversation = await Conversation.findOne(query)
            .populate("participants", "name avatar email")
            .populate("request", "item status");

        if (!conversation) {
            conversation = await Conversation.create({
                participants: [req.user._id, recipientId],
                request: requestId || null,
            });
            conversation = await Conversation.findById(conversation._id)
                .populate("participants", "name avatar email")
                .populate("request", "item status");
        }

        res.json(conversation);
    } catch (error) {
        console.error("getOrCreateConversation error:", error);
        res.status(500).json({ message: "Failed to get or create conversation" });
    }
};

/**
 * GET /api/messages/conversations/:conversationId
 * Returns messages for a conversation (paginated, newest last).
 * Query: ?page=1&limit=50
 */
const getMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 50);
        const skip = (page - 1) * limit;

        // Verify the user is a participant
        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: req.user._id,
        });

        if (!conversation) {
            return res.status(404).json({ message: "Conversation not found" });
        }

        const messages = await Message.find({ conversation: conversationId })
            .populate("sender", "name avatar")
            .sort({ createdAt: 1 })
            .skip(skip)
            .limit(limit);

        // Mark unread messages from the other participant as read
        await Message.updateMany(
            {
                conversation: conversationId,
                sender: { $ne: req.user._id },
                read: false,
            },
            { read: true }
        );

        res.json(messages);
    } catch (error) {
        console.error("getMessages error:", error);
        res.status(500).json({ message: "Failed to fetch messages" });
    }
};

/**
 * POST /api/messages/conversations/:conversationId
 * Send a message. Also emits via Socket.io (handled in server.js).
 * Body: { content }
 */
const sendMessage = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { content } = req.body;

        if (!content || !content.trim()) {
            return res.status(400).json({ message: "Message content is required" });
        }

        // Verify the user is a participant
        const conversation = await Conversation.findOne({
            _id: conversationId,
            participants: req.user._id,
        });

        if (!conversation) {
            return res.status(404).json({ message: "Conversation not found" });
        }

        const message = await Message.create({
            conversation: conversationId,
            sender: req.user._id,
            content: content.trim(),
        });

        const populated = await Message.findById(message._id).populate(
            "sender",
            "name avatar"
        );

        // Update conversation's lastMessage preview
        await Conversation.findByIdAndUpdate(conversationId, {
            lastMessage: content.trim().substring(0, 100),
            lastMessageAt: new Date(),
        });

        // Emit via Socket.io if available (attached to app in server.js)
        const io = req.app.get("io");
        if (io) {
            io.to(conversationId).emit("new_message", populated);
        }

        res.status(201).json(populated);
    } catch (error) {
        console.error("sendMessage error:", error);
        res.status(500).json({ message: "Failed to send message" });
    }
};

/**
 * GET /api/messages/unread-count
 * Returns the total number of unread messages for the current user.
 */
const getUnreadCount = async (req, res) => {
    try {
        // Find all conversations the user participates in
        const conversations = await Conversation.find({
            participants: req.user._id,
        }).select("_id");

        const conversationIds = conversations.map((c) => c._id);

        const count = await Message.countDocuments({
            conversation: { $in: conversationIds },
            sender: { $ne: req.user._id },
            read: false,
        });

        res.json({ count });
    } catch (error) {
        console.error("getUnreadCount error:", error);
        res.status(500).json({ message: "Failed to fetch unread count" });
    }
};

module.exports = {
    getConversations,
    getOrCreateConversation,
    getMessages,
    sendMessage,
    getUnreadCount,
};
