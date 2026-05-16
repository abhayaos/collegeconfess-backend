import mongoose, { Schema, Document } from "mongoose";

export interface IComment extends Document {
  confessionId: mongoose.Types.ObjectId;
  anonymousId: string;
  anonymousName: string;
  message: string;
  createdAt: Date;
}

const CommentSchema = new Schema<IComment>(
  {
    confessionId: { type: Schema.Types.ObjectId, ref: "Confession", required: true },
    anonymousId: { type: String, required: true },
    anonymousName: { type: String, required: true },
    message: { type: String, required: true, maxlength: 1000 },
  },
  { timestamps: true }
);

CommentSchema.index({ confessionId: 1, createdAt: 1 });

export const Comment =
  mongoose.models.Comment || mongoose.model<IComment>("Comment", CommentSchema);
