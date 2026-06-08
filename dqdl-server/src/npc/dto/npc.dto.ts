import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateNpcDto {
  @IsString()
  name: string;

  @IsNumber()
  nature_id: number;

  @IsNumber()
  role_id: number;

  @IsNumber()
  location_id: number;

  @IsOptional()
  @IsString()
  greeting?: string;
}
