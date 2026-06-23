const express = require("express");
const router = express.Router();
const Notification = require("../models/notification");

router.get("/user/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const notifications = await Notification.find({
      $or: [{ userEmail: email }, { receiverEmail: email }],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json(notifications);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Failed to load notifications" });
  }
});

router.post("/", async (req, res) => {
  try {
    console.log("REQ BODY:", req.body);

    const sender = req.body.from || req.body.sender || null;
    const receiver = req.body.userEmail || req.body.receiver || null;
    const message = req.body.message || req.body.text || null;
    const type = req.body.type || "cart";
    const productId = req.body.productId || null;
    const productName = req.body.productName || null;

    if (!receiver || !sender) {
      return res.status(400).json({ error: "Missing receiver or sender" });
    }

    const notif = await Notification.create({
      userEmail: receiver,
      from: sender,
      message,
      type,
      productId,
      productName,
      seen: false,
    });

    res.json({
      success: true,
      notification: notif,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Notification failed" });
  }
});

router.put("/seen/:id", async (req, res) => {
  try {
    const updated = await Notification.findByIdAndUpdate(
      req.params.id,
      { seen: true },
      { new: true },
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update notification" });
  }
});

router.delete("/cart/clear", async (req, res) => {
  try {
    const { customerEmail, productIds } = req.body;

    if (
      !customerEmail ||
      !Array.isArray(productIds) ||
      productIds.length === 0
    ) {
      return res.status(400).json({
        error: "Missing customerEmail or productIds",
      });
    }

    const result = await Notification.deleteMany({
      type: "cart",
      from: customerEmail,
      productId: { $in: productIds },
    });

    res.json({
      success: true,
      deletedCount: result.deletedCount || 0,
    });
  } catch (err) {
    console.error("CLEAR CART NOTIFICATIONS ERROR:", err);
    res.status(500).json({ error: "Failed to clear cart notifications" });
  }
});

module.exports = router;
