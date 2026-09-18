import { IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
export class CreateMemoryDto { @IsString() @MinLength(1) @MaxLength(160) title!: string; @IsString() @MinLength(1) story!: string; @IsOptional() @IsDateString() occurredAt?: string; @IsOptional() @IsUUID() profileId?: string; }
export class UpdateMemoryDto { @IsOptional() @IsString() @MinLength(1) @MaxLength(160) title?: string; @IsOptional() @IsString() @MinLength(1) story?: string; @IsOptional() @IsDateString() occurredAt?: string; @IsOptional() @IsUUID() profileId?: string; }
