require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const connectDB = require("./config/db");
require("./config/firebase");

const authRoutes = require("./routes/authRoutes");
const itemRoutes = require("./routes/itemRoutes");
const requestRoutes = require("./routes/requestRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const messageRoutes = require("./routes/messageRoutes");
const sensorRoutes = require("./routes/sensorRoutes");
const { handleWebhook } = require("./controllers/paymentController");

const app = express();
const server = http.createServer(app);

connectDB();

const allowedOrigins = [
    process.env.CLIENT_URL,
    "https://sharestuffs.vercel.app",
    "http://localhost:5173",
    "http://localhost:4173",
].filter(Boolean);

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, Postman)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        // Also allow any *.vercel.app preview deployments
        if (origin.endsWith(".vercel.app")) return callback(null, true);
        callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
};

app.use(cors(corsOptions));

// ── Socket.io ──────────────────────────────────────────────────────────────
const io = new Server(server, {
    cors: corsOptions,
});

// Authenticate socket connections using the same JWT strategy
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication required"));
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id;
        next();
    } catch {
        next(new Error("Invalid token"));
    }
});

io.on("connection", (socket) => {
    // Client joins a room for each conversation it opens
    socket.on("join_conversation", (conversationId) => {
        socket.join(conversationId);
    });

    socket.on("leave_conversation", (conversationId) => {
        socket.leave(conversationId);
    });

    // Also join a personal room so we can notify the user of new conversations
    socket.join(`user:${socket.userId}`);

    // Join a request-specific room for sensor alerts
    socket.on("join_request", (requestId) => {
        socket.join(`request:${requestId}`);
    });
    socket.on("leave_request", (requestId) => {
        socket.leave(`request:${requestId}`);
    });

    socket.on("disconnect", () => {});
});

// Make io accessible in controllers via req.app.get("io")
app.set("io", io);

// Stripe webhook needs raw body — must be registered BEFORE express.json()
app.post(
    "/api/payments/webhook",
    express.raw({ type: "application/json" }),
    handleWebhook
);

app.use(express.json({ limit: "2mb" }));

app.get("/", (req, res) => {
    res.json({ message: "ShareStuff backend is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/sensors", sensorRoutes);

app.use((req, res) => {
    res.status(404).json({ message: "Route not found" });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
