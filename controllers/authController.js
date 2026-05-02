const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const admin = require("../config/firebase");
const User = require("../models/User");

const generateToken = (userId) => {
    const secret = process.env.JWT_SECRET;
    return jwt.sign({ id: userId }, secret, { expiresIn: "7d" });
};

const register = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: "Name, email, and password are required" });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "Email already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
        });

        const token = generateToken(user._id);
        const userData = user.toObject();
        delete userData.password;

        return res.status(201).json({ token, user: userData });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const user = await User.findOne({ email });
        if (!user || !user.password) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        const token = generateToken(user._id);
        const userData = user.toObject();
        delete userData.password;

        return res.status(200).json({ token, user: userData });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const firebaseLogin = async (req, res) => {
    try {
        const { name, email, firebaseUID, avatar, idToken } = req.body;
        if (!name || !email || !firebaseUID || !avatar || !idToken) {
            return res.status(400).json({ message: "Name, email, firebaseUID, avatar, and idToken are required" });
        }

        const decodedToken = await admin.auth().verifyIdToken(idToken);
        if (decodedToken.uid !== firebaseUID || decodedToken.email !== email) {
            return res.status(401).json({ message: "Invalid Firebase token" });
        }

        let user = await User.findOne({ $or: [{ email }, { firebaseUID }] });
        if (!user) {
            user = await User.create({
                name,
                email,
                firebaseUID,
                avatar,
                password: null,
            });
        }

        const token = generateToken(user._id);
        const userData = user.toObject();
        delete userData.password;

        return res.status(200).json({ token, user: userData });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getMe = async (req, res) => {
    try {
        return res.status(200).json({ user: req.user });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports = { register, login, firebaseLogin, getMe };
