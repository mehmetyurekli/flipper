import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { toJSONOptions } from '../common/to-json';

export const FEEDBACK_STATUSES = ['open', 'resolved'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

@Schema({ timestamps: { createdAt: true, updatedAt: false }, toJSON: toJSONOptions, minimize: false })
export class Feedback {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Project', required: true })
  projectId: Types.ObjectId;

  @Prop({ required: true, maxlength: 2000 })
  message: string;

  @Prop({ type: String, enum: FEEDBACK_STATUSES, default: 'open' })
  status: FeedbackStatus;

  @Prop({ maxlength: 2000 })
  resolutionComment?: string;

  @Prop({ required: true })
  pageUrl: string;

  // Embedded FeedbackContext (shared/types.ts). Validated at the DTO layer.
  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  context: Record<string, any>;

  createdAt: Date;

  @Prop()
  resolvedAt?: Date;
}

export type FeedbackDocument = HydratedDocument<Feedback>;
export const FeedbackSchema = SchemaFactory.createForClass(Feedback);
FeedbackSchema.index({ projectId: 1, status: 1, createdAt: -1 });
