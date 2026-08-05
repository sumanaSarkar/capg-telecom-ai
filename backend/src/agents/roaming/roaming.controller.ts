import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CustomerIdDto } from './roaming.dto';
import { RoamingService } from './roaming.service';

@ApiTags('roaming')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('roaming')
export class RoamingController {
  constructor(private readonly roamingService: RoamingService) {}

  @Get(':customerId')
  @ApiOperation({ summary: 'Get roaming status for a customer' })
  getStatus(@Param('customerId') customerId: string) {
    return this.roamingService.getRoamingStatus(customerId);
  }

  @Post('enable')
  @ApiOperation({ summary: 'Enable roaming for a customer' })
  enable(@Body() dto: CustomerIdDto) {
    return this.roamingService.enableRoaming(dto.customerId);
  }

  @Post('disable')
  @ApiOperation({ summary: 'Disable roaming for a customer' })
  disable(@Body() dto: CustomerIdDto) {
    return this.roamingService.disableRoaming(dto.customerId);
  }
}
