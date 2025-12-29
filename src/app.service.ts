import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  convert(from: string, to: string, amount: number) {
    console.log(from, to, amount);

    return { from, to, amount };
  }
}
