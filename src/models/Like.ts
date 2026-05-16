import mongoose, { Schema, Document } from "mongoose";

export interface ILike extends Document {
  confessionId: mongoose.Types.ObjectId;
  anonymousId: string;
  createdAt: Date;
}

const LikeSchema = new Schema<ILike>(
  {
    confessionId: { type: Schema.Types.ObjectId, ref: "Confession", required: true },
    anonymousId: { type: String, required: true },
  },
  { timestamps: true }
);

LikeSchema.index({ confessionId: 1, anonymousId: 1 }, { unique: true });

export const Like =
  mongoose.models.Like || mongoose.model<ILike>("Like", LikeSchema);
