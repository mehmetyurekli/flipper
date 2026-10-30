import {
  BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FileInterceptor } from '@nestjs/platform-express';
import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { Model } from 'mongoose';
import { config } from '../config';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe';
import { Project } from '../projects/project.schema';
import { StorageService } from '../storage/storage.service';
import { CreateFeedbackDto, UpdateStatusDto } from './feedback.dto';
import { Feedback } from './feedback.schema';
import { normalizeRepoPath } from './source-path';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function flattenErrors(errors: ValidationError[], prefix = ''): string[] {
  return errors.flatMap((e) => {
    const p = prefix ? `${prefix}.${e.property}` : e.property;
    const own = Object.values(e.constraints ?? {}).map((m) => m.replace(e.property, p));
    return [...own, ...flattenErrors(e.children ?? [], p)];
  });
}

@Controller('feedback')
export class FeedbackController {
  constructor(
    @InjectModel(Feedback.name) private readonly feedback: Model<Feedback>,
    @InjectModel(Project.name) private readonly projects: Model<Project>,
    private readonly storage: StorageService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('screenshot', {
      limits: { fileSize: config.maxScreenshotBytes, fieldSize: 2 * 1024 * 1024, files: 1 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'image/png') {
          return cb(new BadRequestException('screenshot must be a PNG (image/png)'), false);
        }
        cb(null, true);
      },
    }),
  )
  async create(@Body('payload') rawPayload: unknown, @UploadedFile() file?: Express.Multer.File) {
    if (typeof rawPayload !== 'string' || !rawPayload) {
      throw new BadRequestException('multipart field "payload" (JSON string) is required');
    }
    let parsed: any;
    try {
      parsed = JSON.parse(rawPayload);
    } catch {
      throw new BadRequestException('payload is not valid JSON');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BadRequestException('payload must be a JSON object');
    }

    const dto = plainToInstance(CreateFeedbackDto, parsed);
    const errors = validateSync(dto, { forbidUnknownValues: false });
    if (errors.length) throw new BadRequestException(flattenErrors(errors));

    // Store the client's plain context (not class instances), minus any client-supplied screenshot.
    const context: Record<string, any> = { ...parsed.context };
    delete context.screenshot;

    if (context.source) {
      const safe = normalizeRepoPath(context.source.file);
      if (!safe) {
        throw new BadRequestException(
          'context.source.file must be a repo-relative path (no leading "/", drive letter, backslashes or ".." segments)',
        );
      }
      context.source = { ...context.source, file: safe };
    }
    // Hierarchy entries are informational: drop unsafe file paths instead of rejecting.
    if (Array.isArray(context.hierarchy)) {
      context.hierarchy = context.hierarchy.map((h: any) => {
        if (h?.file === undefined) return h;
        const safe = normalizeRepoPath(h.file);
        const { file: _f, ...rest } = h;
        return safe ? { ...rest, file: safe } : rest;
      });
    }

    const project = await this.projects.exists({ _id: dto.projectId });
    if (!project) throw new NotFoundException('Project not found');

    if (file) {
      if (!file.buffer || file.buffer.length < PNG_MAGIC.length || !file.buffer.subarray(0, 8).equals(PNG_MAGIC)) {
        throw new BadRequestException('screenshot is not a valid PNG file');
      }
      context.screenshot = await this.storage.save(file.buffer);
    }

    const doc = await this.feedback.create({
      projectId: dto.projectId,
      message: dto.message,
      pageUrl: dto.pageUrl,
      status: 'open',
      context,
    });
    return doc.toJSON();
  }

  @Get(':id')
  async get(@Param('id', ParseObjectIdPipe) id: string) {
    const doc = await this.feedback.findById(id);
    if (!doc) throw new NotFoundException('Feedback not found');
    return doc.toJSON();
  }

  @Patch(':id/status')
  async updateStatus(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateStatusDto) {
    const set: Record<string, unknown> = { status: dto.status };
    const unset: Record<string, 1> = {};
    if (dto.resolutionComment !== undefined) set.resolutionComment = dto.resolutionComment;
    if (dto.status === 'resolved') set.resolvedAt = new Date();
    else unset.resolvedAt = 1;
    const doc = await this.feedback.findByIdAndUpdate(
      id,
      { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { new: true, runValidators: true },
    );
    if (!doc) throw new NotFoundException('Feedback not found');
    return doc.toJSON();
  }
}
