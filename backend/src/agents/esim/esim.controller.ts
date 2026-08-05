import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ActivateEsimDto, DeactivateEsimDto } from './esim.dto';
import { EsimService } from './esim.service';

@ApiTags('esim')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('esim')
export class EsimController {
  constructor(private readonly esimService: EsimService) {}

  @Get(':customerId')
  @ApiOperation({ summary: 'Get eSIM status for a customer' })
  getStatus(@Param('customerId') customerId: string) {
    return this.esimService.getEsimStatus(customerId);
  }

  @Post('activate')
  @ApiOperation({ summary: 'Activate an eSIM for a device' })
  activate(@Body() dto: ActivateEsimDto) {
    return this.esimService.activateEsim(dto.customerId, dto.deviceId);
  }

  @Post('deactivate')
  @ApiOperation({ summary: 'Deactivate the eSIM for a customer' })
  deactivate(@Body() dto: DeactivateEsimDto) {
    return this.esimService.deactivateEsim(dto.customerId);
  }
}
