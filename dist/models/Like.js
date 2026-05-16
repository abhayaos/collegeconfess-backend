import mongoose, { Schema } from "mongoose";
const LikeSchema = new Schema({
    confessionId: { type: Schema.Types.ObjectId, ref: "Confession", required: true },
    anonymousId: { type: String, required: true },
}, { timestamps: true });
LikeSchema.index({ confessionId: 1, anonymousId: 1 }, { unique: true });
export const Like = mongoose.models.Like || mongoose.model("Like", LikeSchema);
//# sourceMappingURL=Like.js.map