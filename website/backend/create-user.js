import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const MONGO_URI = "mongodb://localhost:27017/dtms"; // Change this to your MongoDB URI

const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "superadmin"], default: "admin" },
});
const Admin = mongoose.model("Admin", AdminSchema);

async function run() {
  await mongoose.connect(MONGO_URI);
  const existing = await Admin.findOne({ username: "avnl" });
  if (existing) {
    console.log("User 'avnl' already exists.");
  } else {
    const hashed = await bcrypt.hash("avnlsikar@2206", 10);
    await Admin.create({ username: "avnl", password: hashed, role: "admin" });
    console.log("User 'avnl' created with password 'avnlsikar@2206' (role: admin).");
  }
  await mongoose.disconnect();
}

run().catch(console.error);
