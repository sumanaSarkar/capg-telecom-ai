import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RechargeDto } from './recharge.dto';
import { RechargeService } from './recharge.service';

@ApiTags('recharge')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('recharge')
export class RechargeController {
  constructor(private readonly rechargeService: RechargeService) {}

  @Post()
  @ApiOperation({ summary: 'Apply a recharge/plan change for a customer' })
  applyRecharge(@Body() dto: RechargeDto) {
    return this.rechargeService.applyRecharge(dto.customerId, dto.planId);
  }
}
