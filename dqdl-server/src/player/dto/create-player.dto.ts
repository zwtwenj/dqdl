import { IsString, IsInt, IsOptional, Min, Max, Length } from 'class-validator';

export class CreatePlayerDto {
  @IsString()
  @Length(1, 32)
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  level?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  power?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  intelligence?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  quick?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  stamina?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(999)
  lucky?: number;

  @IsOptional()
  @IsString()
  @Length(0, 512)
  position?: string;
}
