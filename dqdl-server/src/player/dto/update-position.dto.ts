import { IsString, Length } from 'class-validator';

export class UpdatePositionDto {
  @IsString()
  @Length(0, 512)
  position: string;
}
