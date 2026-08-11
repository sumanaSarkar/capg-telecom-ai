import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AutopilotService } from './autopilot.service';

@ApiTags('autopilot')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('autopilot')
export class AutopilotController {
  constructor(private readonly autopilotService: AutopilotService) {}

  @Get(':customerId')
  @ApiOperation({ summary: 'Get Telly Autopilot settings for a customer' })
  getSettings(@Param('customerId') customerId: string) {
    return this.autopilotService.getSettings(customerId);
  }

  @Post(':customerId/enable')
  @ApiOperation({ summary: 'Enable Telly Autopilot — Telly manages payments and recharges' })
  enable(@Param('customerId') customerId: string) {
    return this.autopilotService.enable(customerId);
  }

  @Delete(':customerId/disable')
  @ApiOperation({ summary: 'Disable Telly Autopilot — customer takes back full control' })
  disable(@Param('customerId') customerId: string) {
    return this.autopilotService.disable(customerId);
  }
}
