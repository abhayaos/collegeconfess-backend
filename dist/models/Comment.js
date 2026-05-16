import mongoose, { Schema } from "mongoose";
const CommentSchema = new Schema({
    confessionId: { type: Schema.Types.ObjectId, ref: "Confession", required: true },
    anonymousId: { type: String, required: true },
    anonymousName: { type: String, required: true },
    message: { type: String, required: true, maxlength: 1000 },
}, { timestamps: true });
CommentSchema.index({ confessionId: 1, createdAt: 1 });
export const Comment = mongoose.models.Comment || mongoose.model("Comment", CommentSchema);
//# sourceMappingURL=Comment.js.map