import { Type } from 'class-transformer';
import {
  IsArray, IsIn, IsInt, IsMongoId, IsNumber, IsObject, IsOptional, IsString, Length, MaxLength, Min,
  ValidateNested,
} from 'class-validator';
import { FEEDBACK_STATUSES, FeedbackStatus } from './feedback.schema';

class RectDto {
  @IsNumber() x: number;
  @IsNumber() y: number;
  @IsNumber() width: number;
  @IsNumber() height: number;
}

class SizeDto {
  @IsNumber() width: number;
  @IsNumber() height: number;
}

class PointDto {
  @IsNumber() x: number;
  @IsNumber() y: number;
}

class ElementDto {
  @IsString() @MaxLength(100) tag: string;
  @IsOptional() @IsString() @MaxLength(5000) text?: string;
  @IsString() @MaxLength(5000) selector: string;
  @IsOptional() @IsObject() attributes?: Record<string, string>;
  @ValidateNested() @Type(() => RectDto) boundingRect: RectDto;
}

class SourceDto {
  @IsString() @Length(1, 1000) file: string;
  @IsInt() @Min(0) line: number;
  @IsOptional() @IsInt() @Min(0) column?: number;
  @IsOptional() @IsString() @MaxLength(200) component?: string;
}

class InstanceDto {
  @IsOptional() @IsString() @MaxLength(500) key?: string;
  @IsOptional() @IsInt() index?: number;
  @IsOptional() @IsString() @MaxLength(500) domId?: string;
  @IsOptional() @IsString() @MaxLength(200) component?: string;
  @IsOptional() @IsObject() propsSummary?: Record<string, unknown>;
}

class HierarchyEntryDto {
  @IsString() @MaxLength(200) component: string;
  @IsOptional() @IsString() @MaxLength(500) key?: string;
  @IsOptional() @IsInt() index?: number;
  @IsOptional() @IsString() @MaxLength(1000) file?: string;
  @IsOptional() @IsInt() line?: number;
}

class DiscoveryDto {
  @IsIn(['debugSource', 'inspectorAttr', 'debugStack', 'none']) fileStrategy: string;
  @IsIn(['fiberKey', 'domId', 'none']) instanceStrategy: string;
}

export class ContextDto {
  @ValidateNested() @Type(() => ElementDto) element: ElementDto;
  @IsOptional() @ValidateNested() @Type(() => SourceDto) source?: SourceDto;
  @IsOptional() @ValidateNested() @Type(() => InstanceDto) instance?: InstanceDto;
  @IsArray() @ValidateNested({ each: true }) @Type(() => HierarchyEntryDto) hierarchy: HierarchyEntryDto[];
  @ValidateNested() @Type(() => DiscoveryDto) discovery: DiscoveryDto;
  @ValidateNested() @Type(() => SizeDto) viewport: SizeDto;
  @ValidateNested() @Type(() => PointDto) scrollPosition: PointDto;
  @IsOptional() @IsString() @MaxLength(1000) userAgent?: string;
}

export class CreateFeedbackDto {
  @IsMongoId() projectId: string;
  @IsString() @Length(1, 2000) message: string;
  @IsString() @Length(1, 2000) pageUrl: string;
  @IsObject() @ValidateNested() @Type(() => ContextDto) context: ContextDto;
}

export class UpdateStatusDto {
  @IsIn(FEEDBACK_STATUSES) status: FeedbackStatus;
  @IsOptional() @IsString() @MaxLength(2000) resolutionComment?: string;
}
