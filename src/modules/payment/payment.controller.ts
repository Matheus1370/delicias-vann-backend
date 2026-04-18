import { Controller, Post, Headers, Body, RawBodyRequest, Req, HttpCode } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { Public } from '../../common/decorators/public.decorator';
import { Request } from 'express';

@Controller('webhooks')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Public()
  @Post('abacate-pay')
  @HttpCode(200)
  async handleAbacatePay(
    @Headers('x-abacate-signature') signature: string,
    @Body() body: any,
    @Req() req: RawBodyRequest<Request>,
  ) {
    await this.paymentService.processWebhook(signature, body, req.rawBody!);
    return { received: true };
  }
}
