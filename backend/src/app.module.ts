import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { config } from './config';
import { FeedbackController } from './feedback/feedback.controller';
import { Feedback, FeedbackSchema } from './feedback/feedback.schema';
import { Project, ProjectSchema } from './projects/project.schema';
import { ProjectsController } from './projects/projects.controller';
import { LocalDiskStorageService, StorageService } from './storage/storage.service';

@Module({
  imports: [
    MongooseModule.forRoot(config.mongoUri),
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: Feedback.name, schema: FeedbackSchema },
    ]),
  ],
  controllers: [ProjectsController, FeedbackController],
  providers: [{ provide: StorageService, useClass: LocalDiskStorageService }],
})
export class AppModule {}
