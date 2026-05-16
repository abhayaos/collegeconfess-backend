import mongoose, { Document } from "mongoose";
export interface IComment extends Document {
    confessionId: mongoose.Types.ObjectId;
    anonymousId: string;
    anonymousName: string;
    message: string;
    createdAt: Date;
}
export declare const Comment: mongoose.Model<any, {}, {}, {}, any, any, any>;
//# sourceMappingURL=Comment.d.ts.map