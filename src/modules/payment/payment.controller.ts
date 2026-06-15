import {
  Controller,
  Post,
  Headers,
  Body,
  Param,
  RawBodyRequest,
  Req,
  Request as NestRequest,
  HttpCode,
} from '@nestjs/common';
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

@Controller('payments')
export class PaymentSimulacaoController {
  constructor(private paymentService: PaymentService) {}

  @Post(':pedidoId/simular')
  async simular(@Param('pedidoId') pedidoId: string, @NestRequest() req: any) {
    return this.paymentService.simularConfirmacao(
      pedidoId,
      req.user.sub,
      req.user.role,
    );
  }
}
