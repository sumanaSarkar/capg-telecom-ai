import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ConfirmPaymentDto, InitiatePaymentDto } from './payment.dto';
import { PaymentService } from './payment.service';

@ApiTags('payment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('initiate')
  @ApiOperation({ summary: 'Initiate a payment for a plan' })
  initiate(@Body() dto: InitiatePaymentDto) {
    return this.paymentService.initiatePayment(
      dto.customerId,
      dto.planId,
      dto.amount,
    );
  }

  @Post('confirm')
  @ApiOperation({ summary: 'Confirm a pending payment' })
  confirm(@Body() dto: ConfirmPaymentDto) {
    return this.paymentService.confirmPayment(dto.paymentId);
  }
}
