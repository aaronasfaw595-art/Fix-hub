const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    room: String,
    sender: String,
    receiver: String,
    text: String,
    time: Number,
    seen: { type: Boolean, default: false },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Message", messageSchema);
