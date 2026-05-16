import bcrypt from "bcryptjs";
import mongoose from "mongoose";
const AdminSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});
const Admin = mongoose.models.Admin || mongoose.model("Admin", AdminSchema);
export async function seedAdmin() {
    const username = process.env.ADMIN_ID;
    const password = process.env.ADMIN_PASSWORD;
    if (!username || !password) {
        console.warn("ADMIN_ID or ADMIN_PASSWORD not set, skipping admin seed");
        return;
    }
    const existing = await Admin.findOne({ username });
    const hashed = await bcrypt.hash(password, 12);
    if (existing) {
        const valid = await bcrypt.compare(password, existing.password);
        if (valid) {
            console.log(`Admin user "${username}" already up to date`);
            return;
        }
        existing.password = hashed;
        await existing.save();
        console.log(`Admin user "${username}" password updated`);
        return;
    }
    await Admin.create({ username, password: hashed });
    console.log(`Admin user "${username}" created`);
}
//# sourceMappingURL=seed.js.map