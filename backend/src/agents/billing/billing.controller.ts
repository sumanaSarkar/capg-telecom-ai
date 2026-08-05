import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { BillingService } from './billing.service';

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get(':customerId')
  @ApiOperation({ summary: 'Get billing history for a customer' })
  getBillingHistory(@Param('customerId') customerId: string) {
    return this.billingService.getBillingHistory(customerId);
  }
}
