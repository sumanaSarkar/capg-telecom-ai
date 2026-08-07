import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AskDto } from './ask.dto';
import { OrchestratorService } from './orchestrator.service';

@ApiTags('orchestrator')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orchestrator')
export class OrchestratorController {
  constructor(private readonly orchestratorService: OrchestratorService) {}

  @Get('history/:customerId')
  @ApiOperation({ summary: 'Get agent communication history for a customer' })
  getHistory(@Param('customerId') customerId: string) {
    return this.orchestratorService.getHistory(customerId);
  }

  @Delete('history/:customerId')
  @ApiOperation({ summary: 'Clear agent communication history for a customer' })
  clearHistory(@Param('customerId') customerId: string) {
    this.orchestratorService.clearHistory(customerId);
    return { success: true };
  }

  @Post('ask')
  @ApiOperation({
    summary:
      'Ask the AI assistant a question and drive the multi-agent orchestration flow',
  })
  ask(@Body() dto: AskDto) {
    return this.orchestratorService.ask(dto);
  }
}
