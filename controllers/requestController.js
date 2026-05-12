const Item = require("../models/Item");
const Request = require("../models/Request");
const User = require("../models/User");

const calculateFee = (startDate, endDate, dailyFee, deposit) => {
    const days = Math.max(1, Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)));
    return days * dailyFee + deposit;
};

// Penalty rate: 10% of daily fee per day late
const PENALTY_RATE = 0.1;

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

        const request = await Request.findById(req.params.id)
            .populate("item")
            .populate("borrower")
            .populate("lender");

        if (!request) {
            return res.status(404).json({ message: "Request not found" });
        }

        const isLender = request.lender._id.toString() === req.user._id.toString();
        const isBorrower = request.borrower._id.toString() === req.user._id.toString();

        // Lender can accept, reject, delivered, or mark returned
        if (isLender && ["accepted", "rejected", "delivered", "returned"].includes(status)) {
            // Handle rejection with refund
            if (status === "rejected" && request.paymentStatus === "paid") {
                const refundAmount = request.totalFee;

                request.paymentStatus = "refunded";
                request.refundAmount = refundAmount;
                request.refundReason = "Request rejected by lender";
                request.refundedAt = new Date();

                // Refund to borrower
                await User.findByIdAndUpdate(request.borrower._id, {
                    $inc: { accountBalance: refundAmount },
                    $push: {
                        paymentHistory: {
                            requestId: request._id,
                            itemTitle: request.item.title,
                            amount: refundAmount,
                            paidAt: new Date(),
                            type: "refunded",
                            reason: "Request rejected by lender",
                        },
                    },
                });

                // Deduct from lender
                await User.findByIdAndUpdate(request.lender._id, {
                    $inc: { totalEarned: -refundAmount, accountBalance: -refundAmount },
                    $push: {
                        paymentHistory: {
                            requestId: request._id,
                            itemTitle: request.item.title,
                            amount: refundAmount,
                            paidAt: new Date(),
                            type: "refunded",
                            reason: "Refund issued - request rejected",
                        },
                    },
                });
            }

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
            // Handle late return penalty
            if (status === "returned") {
                const now = new Date();
                const endDate = new Date(request.endDate);
                const daysLate = Math.max(0, Math.ceil((now - endDate) / (1000 * 60 * 60 * 24)));

                if (daysLate > 0 && request.paymentStatus === "paid") {
                    const dailyFee = request.item.dailyFee || 0;
                    const penalty = Math.round(dailyFee * PENALTY_RATE * daysLate * 100) / 100;

                    request.latePenalty = penalty;
                    request.daysLate = daysLate;
                    request.penaltyAppliedAt = new Date();
                    request.actualReturnDate = now;

                    // Deduct penalty from borrower
                    await User.findByIdAndUpdate(request.borrower._id, {
                        $inc: { accountBalance: -penalty, totalPenalties: penalty },
                        $push: {
                            paymentHistory: {
                                requestId: request._id,
                                itemTitle: request.item.title,
                                amount: penalty,
                                paidAt: new Date(),
                                type: "penalty",
                                reason: `Late return penalty: ${daysLate} day(s) late`,
                            },
                        },
                    });

                    // Credit penalty to lender
                    await User.findByIdAndUpdate(request.lender._id, {
                        $inc: { accountBalance: penalty, totalEarned: penalty },
                        $push: {
                            paymentHistory: {
                                requestId: request._id,
                                itemTitle: request.item.title,
                                amount: penalty,
                                paidAt: new Date(),
                                type: "penalty",
                                reason: `Late return penalty received: ${daysLate} day(s) late`,
                            },
                        },
                    });
                }
            }

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
