import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { toJSONOptions } from '../common/to-json';

@Schema({ timestamps: { createdAt: true, updatedAt: false }, toJSON: toJSONOptions })
export class Project {
  @Prop({ required: true, trim: true, index: true })
  name: string;

  @Prop()
  repositoryUrl?: string;

  createdAt: Date;
}

export type ProjectDocument = HydratedDocument<Project>;
export const ProjectSchema = SchemaFactory.createForClass(Project);
