const Item = require("../models/Item");
const Request = require("../models/Request");

const calculateFee = (startDate, endDate, dailyFee, deposit) => {
    const days = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));
    return days * dailyFee + deposit;
};

const createRequest = async (req, res) => {
    try {
        const { itemId, startDate, endDate } = req.body;
        if (!itemId || !startDate || !endDate) {
            return res.status(400).json({ message: "itemId, startDate, and endDate are required" });
        }

        const item = await Item.findById(itemId);
        if (!item) {
            return res.status(404).json({ message: "Item not found" });
        }
        if (!item.available) {
            return res.status(400).json({ message: "Item is not available for request" });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
            return res.status(400).json({ message: "Invalid startDate or endDate" });
        }

        const totalFee = calculateFee(start, end, item.dailyFee, item.deposit);
        const request = await Request.create({
            item: item._id,
            borrower: req.user._id,
            lender: item.owner,
            startDate: start,
            endDate: end,
            totalFee,
        });

        return res.status(201).json(request);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getMyRequests = async (req, res) => {
    try {
        const requests = await Request.find({ borrower: req.user._id })
            .populate("item", "title images")
            .populate("lender", "name avatar")
            .sort({ createdAt: -1 });

        return res.status(200).json(requests);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getLenderRequests = async (req, res) => {
    try {
        const requests = await Request.find({ lender: req.user._id })
            .populate("item", "title images")
            .populate("borrower", "name avatar")
            .sort({ createdAt: -1 });

        return res.status(200).json(requests);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const updateRequestStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (!status || !["accepted", "rejected", "delivered", "returned"].includes(status)) {
            return res.status(400).json({ message: "Status must be accepted, rejected, delivered, or returned" });
        }

        const request = await Request.findById(req.params.id).populate("item");
        if (!request) {
            return res.status(404).json({ message: "Request not found" });
        }

        const isLender = request.lender.toString() === req.user._id.toString();
        const isBorrower = request.borrower.toString() === req.user._id.toString();

        // Lender can accept, reject, delivered, or mark returned
        if (isLender && ["accepted", "rejected", "delivered", "returned"].includes(status)) {
            request.status = status;
            await request.save();

            if (status === "accepted") {
                await Item.findByIdAndUpdate(request.item._id, { available: false });
            }
            if (status === "returned") {
                await Item.findByIdAndUpdate(request.item._id, { available: true });
            }
        }
        // Borrower can mark delivered or returned
        else if (isBorrower && ["delivered", "returned"].includes(status)) {
            request.status = status;
            await request.save();

            if (status === "returned") {
                await Item.findByIdAndUpdate(request.item._id, { available: true });
            }
        }
        else {
            return res.status(403).json({ message: "Forbidden: you don't have permission to update this request" });
        }

        const updatedRequest = await Request.findById(request._id)
            .populate("item", "title images")
            .populate("borrower", "name avatar")
            .populate("lender", "name avatar");

        return res.status(200).json(updatedRequest);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports = { createRequest, getMyRequests, getLenderRequests, updateRequestStatus };
