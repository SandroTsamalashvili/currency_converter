export class ConvertDto {
  from: string;
  to: string;
  amount: number;
}

export class ConvertResponseDto {
  from: string;
  to: string;
  amount: number;
  result: number;
}
