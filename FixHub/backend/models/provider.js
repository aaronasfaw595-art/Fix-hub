const mongoose = require("mongoose");

const providerSchema = new mongoose.Schema(
  {
    name: String,
    role: String,
    specialty: String,
    location: String,
    price: Number,
    image: String,
    description: String,
    owner: String,
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    badge: { type: String, default: "New" },
    comments: [
      {
        userEmail: String,
        userName: String,
        text: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    ratings: [
      {
        userEmail: String,
        score: Number,
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

providerSchema.index({ owner: 1, createdAt: -1 });
providerSchema.index({ role: 1, specialty: 1 });
providerSchema.index({ name: 1 });

module.exports = mongoose.model("Provider", providerSchema);
