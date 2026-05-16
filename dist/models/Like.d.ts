import mongoose, { Document } from "mongoose";
export interface ILike extends Document {
    confessionId: mongoose.Types.ObjectId;
    anonymousId: string;
    createdAt: Date;
}
export declare const Like: mongoose.Model<any, {}, {}, {}, any, any, any>;
//# sourceMappingURL=Like.d.ts.map