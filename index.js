// import packages
const express = require("express");
const cors = require("cors");
require("dotenv").config();

// create app
const app = express();

// middleware
app.use(cors());
app.use(express.json());

// test route
app.get("/", (req, res) => {
    res.send("Server is running 🚀");
});

// sample API route
app.get("/api/test", (req, res) => {
    res.json({ message: "API working perfectly" });
});

// port
const PORT = process.env.PORT || 5000;

// start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});