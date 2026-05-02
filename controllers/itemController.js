const Item = require("../models/Item");

const getItems = async (req, res) => {
    try {
        const { category, search } = req.query;
        const query = { available: true };

        if (category) {
            query.category = category;
        }
        if (search) {
            query.title = { $regex: search, $options: "i" };
        }

        const items = await Item.find(query)
            .populate("owner", "name avatar rating")
            .sort({ createdAt: -1 });

        return res.status(200).json(items);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getMyItems = async (req, res) => {
    try {
        const items = await Item.find({ owner: req.user._id })
            .populate("owner", "name avatar rating")
            .sort({ createdAt: -1 });

        return res.status(200).json(items);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getItemById = async (req, res) => {
    try {
        const item = await Item.findById(req.params.id).populate("owner", "name avatar rating");
        if (!item) {
            return res.status(404).json({ message: "Item not found" });
        }

        return res.status(200).json(item);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const createItem = async (req, res) => {
    try {
        const { title, description, category, dailyFee, deposit, location, images } = req.body;
        if (!title || !description || !category) {
            return res.status(400).json({ message: "Title, description, and category are required" });
        }

        const item = await Item.create({
            owner: req.user._id,
            title,
            description,
            category,
            images: Array.isArray(images) ? images : [],
            dailyFee: dailyFee || 0,
            deposit: deposit || 0,
            location: location || "",
        });

        const populatedItem = await Item.findById(item._id).populate("owner", "name avatar rating");
        return res.status(201).json(populatedItem);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const updateItem = async (req, res) => {
    try {
        const item = await Item.findById(req.params.id);
        if (!item) {
            return res.status(404).json({ message: "Item not found" });
        }
        if (item.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "Forbidden: not the item owner" });
        }

        const updates = {
            title: req.body.title ?? item.title,
            description: req.body.description ?? item.description,
            category: req.body.category ?? item.category,
            images: Array.isArray(req.body.images) ? req.body.images : item.images,
            dailyFee: req.body.dailyFee ?? item.dailyFee,
            deposit: req.body.deposit ?? item.deposit,
            location: req.body.location ?? item.location,
            available: typeof req.body.available === "boolean" ? req.body.available : item.available,
        };

        Object.assign(item, updates);
        await item.save();

        const updatedItem = await Item.findById(item._id).populate("owner", "name avatar rating");
        return res.status(200).json(updatedItem);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const deleteItem = async (req, res) => {
    try {
        const item = await Item.findById(req.params.id);
        if (!item) {
            return res.status(404).json({ message: "Item not found" });
        }
        if (item.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: "Forbidden: not the item owner" });
        }

        await item.deleteOne();
        return res.status(200).json({ message: "Item deleted successfully" });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports = { getItems, getMyItems, getItemById, createItem, updateItem, deleteItem };
