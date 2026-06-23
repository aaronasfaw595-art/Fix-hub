const express = require("express");
const router = express.Router();

const Message = require("../models/Message");
const Notification = require("../models/notification");

router.get("/", async (req, res) => {
  try {
    const messages = await Message.find().sort({ time: -1 }).limit(100).lean();
    res.json(messages);
  } catch (err) {
    console.error("MESSAGE LIST ERROR:", err);
    res.status(500).json({ error: "Failed to load messages" });
  }
});
router.get("/user/:email", async (req, res) => {
  try {
    const email = req.params.email;

    const notifications = await Notification.find({
      $or: [{ userEmail: email }],
    }).sort({ createdAt: -1 });

    res.json(notifications);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Failed to load notifications" });
  }
});
router.get("/:room", async (req, res) => {
  try {
    const messages = await Message.find({
      room: req.params.room,
    })
      .sort({ time: 1 })
      .lean();

    res.json(messages);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Failed to load messages" });
  }
});

router.post("/", async (req, res) => {
  try {
    const msg = await Message.create(req.body);

    const { sender, receiver, text } = req.body;

    if (sender !== receiver) {
      await Notification.create({
        userEmail: receiver,
        from: sender,
        message: text,
        type: "message",
        seen: false,
      });
    }

    res.json(msg);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Message failed" });
  }
});

module.exports = router;
