import { IsString, IsInt, IsOptional, IsArray } from 'class-validator';

export class ExpandLocationDto {
  @IsOptional()
  @IsInt()
  count?: number; // 手动指定生成数量，不填则按规则随机
}

export class CreateLocationDto {
  @IsString()
  name: string;

  @IsString()
  loc_type: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  depth?: number;

  @IsOptional()
  @IsInt()
  danger_level?: number;

  @IsOptional()
  @IsInt()
  parent_id?: number;

  @IsOptional()
  @IsArray()
  available_actions?: string[];

  @IsOptional()
  @IsArray()
  tags?: string[];
}
