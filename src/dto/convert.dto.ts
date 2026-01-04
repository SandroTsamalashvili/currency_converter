import { IsString, IsNumber, Min } from 'class-validator';

export class ConvertDto {
  @IsString()
  from: string;
  @IsString()
  to: string;
  @IsNumber()
  @Min(1)
  amount: number;
}

export class ConvertResponseDto {
  from: string;
  to: string;
  amount: number;
  result: number;
}
