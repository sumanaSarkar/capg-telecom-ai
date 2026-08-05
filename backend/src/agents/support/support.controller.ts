import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CreateTicketDto } from './support.dto';
import { SupportService } from './support.service';

@ApiTags('support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('tickets/:customerId')
  @ApiOperation({ summary: 'Get support tickets for a customer' })
  getTickets(@Param('customerId') customerId: string) {
    return this.supportService.getTickets(customerId);
  }

  @Post('tickets')
  @ApiOperation({ summary: 'Create a new support ticket' })
  createTicket(@Body() dto: CreateTicketDto) {
    return this.supportService.createTicket(
      dto.customerId,
      dto.issue,
      dto.priority,
    );
  }
}
