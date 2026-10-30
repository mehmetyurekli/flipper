import { Body, Controller, Get, NotFoundException, Param, Post, Query, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { IsOptional, IsString, IsUrl, Length, MaxLength } from 'class-validator';
import { Model } from 'mongoose';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe';
import { Feedback } from '../feedback/feedback.schema';
import { Project } from './project.schema';

export class CreateProjectDto {
  @IsString()
  @Length(1, 200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @IsUrl({ require_tld: false })
  repositoryUrl?: string;
}

@Controller('projects')
export class ProjectsController {
  constructor(
    @InjectModel(Project.name) private readonly projects: Model<Project>,
    @InjectModel(Feedback.name) private readonly feedback: Model<Feedback>,
  ) {}

  @Post()
  async create(@Body() dto: CreateProjectDto) {
    const doc = await this.projects.create({ name: dto.name, repositoryUrl: dto.repositoryUrl });
    return doc.toJSON();
  }

  @Get(':id')
  async get(@Param('id', ParseObjectIdPipe) id: string) {
    const doc = await this.projects.findById(id);
    if (!doc) throw new NotFoundException('Project not found');
    return doc.toJSON();
  }

  @Get(':id/feedback')
  async listFeedback(@Param('id', ParseObjectIdPipe) id: string, @Query('status') status?: string) {
    const filter: Record<string, unknown> = { projectId: id };
    if (status !== undefined && status !== '') {
      if (status !== 'open' && status !== 'resolved') {
        throw new BadRequestException('status must be "open" or "resolved"');
      }
      filter.status = status;
    }
    const docs = await this.feedback.find(filter).sort({ createdAt: -1 });
    return docs.map((d) => d.toJSON());
  }
}
