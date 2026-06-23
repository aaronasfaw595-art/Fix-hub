const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  userEmail: String,
  receiverEmail: String,
  from: String,
  commentText: String,
  productId: String,
  productName: String,
  message: String,
  type: String,
  seen: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ userEmail: 1, createdAt: -1 });
notificationSchema.index({ receiverEmail: 1, createdAt: -1 });
notificationSchema.index({ seen: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
