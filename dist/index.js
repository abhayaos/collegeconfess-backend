try {
    await import("dotenv/config");
}
catch {
    // dotenv not available — assume env vars are set by the platform
}
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { seedAdmin } from "./seed";
const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json());
mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
    console.log("MongoDB connected");
    await seedAdmin();
})
    .catch((err) => console.error("MongoDB connection error:", err));
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
//# sourceMappingURL=index.js.map