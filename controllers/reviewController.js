const Review = require("../models/Review");
const Request = require("../models/Request");
const User = require("../models/User");

const createReview = async (req, res) => {
    try {
        const { revieweeId, requestId, rating, comment } = req.body;
        if (!revieweeId || !requestId || !rating) {
            return res.status(400).json({ message: "revieweeId, requestId, and rating are required" });
        }

        const request = await Request.findById(requestId);
        if (!request) {
            return res.status(404).json({ message: "Request not found" });
        }
        if (request.status !== "returned") {
            return res.status(400).json({ message: "Reviews can only be created for returned requests" });
        }

        const isBorrower = request.borrower.toString() === req.user._id.toString();
        const isLender = request.lender.toString() === req.user._id.toString();
        if (!isBorrower && !isLender) {
            return res.status(403).json({ message: "Forbidden: you are not part of this request" });
        }

        const expectedRevieweeId = isBorrower ? request.lender.toString() : request.borrower.toString();
        if (revieweeId !== expectedRevieweeId) {
            return res.status(400).json({ message: "Reviewee must be the other participant in the request" });
        }

        const existingReview = await Review.findOne({ reviewer: req.user._id, request: requestId });
        if (existingReview) {
            return res.status(400).json({ message: "You have already reviewed this request" });
        }

        const review = await Review.create({
            reviewer: req.user._id,
            reviewee: revieweeId,
            request: requestId,
            rating,
            comment: comment || "",
        });

        const reviews = await Review.find({ reviewee: revieweeId });
        const totalReviews = reviews.length;
        const ratingSum = reviews.reduce((sum, item) => sum + item.rating, 0);
        const averageRating = totalReviews === 0 ? 0 : Number((ratingSum / totalReviews).toFixed(2));

        await User.findByIdAndUpdate(revieweeId, {
            rating: averageRating,
            totalReviews,
        });

        return res.status(201).json(review);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getReviewsByUser = async (req, res) => {
    try {
        const reviews = await Review.find({ reviewee: req.params.userId })
            .populate("reviewer", "name avatar")
            .sort({ createdAt: -1 });

        return res.status(200).json(reviews);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const getMyReviews = async (req, res) => {
    try {
        // Reviews the current user has written (as reviewer)
        const reviews = await Review.find({ reviewer: req.user._id })
            .select("request")
            .lean();

        // Return just the requestIds so the frontend knows which requests are already reviewed
        const reviewedRequestIds = reviews.map((r) => r.request.toString());
        return res.status(200).json(reviewedRequestIds);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

module.exports = { createReview, getReviewsByUser, getMyReviews };
