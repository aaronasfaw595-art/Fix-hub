const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    firstName: String,
    lastName: String,
    phone: String,
    birthDate: String,
    bio: String,
    profileImage: String,
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["Customer", "Seller", "Technician"],
      default: "Customer",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);
