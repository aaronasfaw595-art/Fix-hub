const express = require("express");
const router = express.Router();
const multer = require("multer");
const Provider = require("../models/provider");
const Notification = require("../models/notification");

const BADGE_LIMITS = {
  topRated: 4.8,
  highlyRated: 4.5,
  trusted: 4.0,
};

const getBadge = (avg) => {
  if (avg >= BADGE_LIMITS.topRated) return "Top Rated";
  if (avg >= BADGE_LIMITS.highlyRated) return "Highly Rated";
  if (avg >= BADGE_LIMITS.trusted) return "Trusted";
  return "New";
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// GET all
router.get("/", async (req, res) => {
  try {
    const providers = await Provider.find().sort({ createdAt: -1 }).lean();
    res.json(providers);
  } catch (error) {
    console.error("Provider list error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to load providers" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const provider = await Provider.findById(req.params.id);
    if (!provider)
      return res
        .status(404)
        .json({ success: false, message: "Provider not found" });
    res.json(provider);
  } catch (error) {
    console.error("Provider fetch error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch provider" });
  }
});

// CREATE
router.post("/", upload.single("image"), async (req, res) => {
  try {
    const provider = await Provider.create({
      name: req.body.name,
      role: req.body.role,
      specialty: req.body.specialty,
      location: req.body.location,
      price: req.body.price,
      description: req.body.description,
      owner: req.body.owner || null,
      image: req.file ? req.file.filename : null,
      ratingAvg: 0,
      ratingCount: 0,
      badge: "New",
      ratings: [],
    });

    res.json({
      success: true,
      message: "Provider registered successfully",
      provider,
    });
  } catch (error) {
    console.error("Provider create error:", error);
    res
      .status(500)
      .json({ success: false, message: "Provider registration failed" });
  }
});

router.post("/:id/comments", async (req, res) => {
  try {
    const { userEmail, userName, text, role } = req.body;

    if (!userEmail || !text) {
      return res
        .status(400)
        .json({ success: false, message: "Missing comment details" });
    }

    if (String(role || "").toLowerCase() !== "customer") {
      return res
        .status(403)
        .json({ success: false, message: "Only customers can post comments" });
    }

    const provider = await Provider.findById(req.params.id);
    if (!provider) {
      return res
        .status(404)
        .json({ success: false, message: "Provider not found" });
    }

    provider.comments = provider.comments || [];
    provider.comments.unshift({
      userEmail,
      userName: userName || userEmail,
      text: String(text).trim(),
      createdAt: new Date(),
    });

    await provider.save();

    if (provider.owner) {
      const receiverEmail = String(provider.owner).trim();
      if (
        receiverEmail.toLowerCase() !== String(userEmail).trim().toLowerCase()
      ) {
        try {
          await Notification.create({
            userEmail: receiverEmail,
            receiverEmail,
            from: userEmail,
            commentText: String(text).trim(),
            message: `${userName || userEmail} commented on your service: ${String(text).trim()}`,
            type: "comment",
            productId: provider._id,
            productName: provider.name || "service",
            seen: false,
          });
        } catch (notifyErr) {
          console.error("Provider comment notification failed:", notifyErr);
        }
      }
    }

    res.json({ success: true, comments: provider.comments });
  } catch (error) {
    console.error("Provider comment error:", error);
    res.status(500).json({ success: false, message: "Failed to save comment" });
  }
});

router.post("/:id/rate", async (req, res) => {
  try {
    const providerId = req.params.id;
    const score = Number(req.body.rating || req.body.score);
    const userEmail = String(req.body.userEmail || "anonymous");

    if (!Number.isFinite(score) || score < 1 || score > 5) {
      return res
        .status(400)
        .json({ success: false, message: "Rating must be between 1 and 5" });
    }

    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res
        .status(404)
        .json({ success: false, message: "Provider not found" });
    }

    const role = String(req.body.role || "").toLowerCase();
    if (role !== "customer") {
      return res
        .status(403)
        .json({ success: false, message: "Only customers can rate providers" });
    }

    const normalizedUserEmail = String(userEmail).trim().toLowerCase();
    const rawRatings = Array.isArray(provider.ratings) ? provider.ratings : [];
    const seen = new Set();
    const uniqueRatings = [];

    rawRatings.forEach((item) => {
      const entryEmail = String(item?.userEmail || "")
        .trim()
        .toLowerCase();
      if (!entryEmail || seen.has(entryEmail)) return;
      seen.add(entryEmail);
      uniqueRatings.push({
        userEmail: item.userEmail,
        score: Number(item.score || 0),
        createdAt: item.createdAt || new Date(),
      });
    });

    const existing = uniqueRatings.find(
      (item) =>
        String(item.userEmail || "")
          .trim()
          .toLowerCase() === normalizedUserEmail,
    );

    if (existing) {
      existing.score = score;
      existing.createdAt = new Date();
    } else {
      uniqueRatings.push({
        userEmail,
        score,
        createdAt: new Date(),
      });
    }

    provider.ratings = uniqueRatings;

    const total = provider.ratings.reduce(
      (sum, item) => sum + (Number(item.score) || 0),
      0,
    );
    provider.ratingCount = provider.ratings.length;
    provider.ratingAvg = provider.ratingCount
      ? Number((total / provider.ratingCount).toFixed(1))
      : 0;
    provider.badge = getBadge(provider.ratingAvg);

    await provider.save();

    if (provider.owner) {
      const receiverEmail = String(provider.owner).trim();
      if (
        receiverEmail.toLowerCase() !== String(userEmail).trim().toLowerCase()
      ) {
        try {
          await Notification.create({
            userEmail: receiverEmail,
            receiverEmail,
            from: userEmail,
            message: `${userEmail} rated your service ${score}/5`,
            type: "rating",
            productId: provider._id,
            productName: provider.name || "service",
            seen: false,
          });
        } catch (notifyErr) {
          console.error("Provider rating notification failed:", notifyErr);
        }
      }
    }

    res.json({ success: true, provider });
  } catch (error) {
    console.error("Provider rating error:", error);
    res.status(500).json({ success: false, message: "Failed to save rating" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const updated = await Provider.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    res.json({ success: true, provider: updated });
  } catch (error) {
    console.error("Provider update error:", error);
    res.status(500).json({ success: false, message: "Provider update failed" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await Provider.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Provider deleted" });
  } catch (error) {
    console.error("Provider delete error:", error);
    res.status(500).json({ success: false, message: "Provider delete failed" });
  }
});

module.exports = router;
