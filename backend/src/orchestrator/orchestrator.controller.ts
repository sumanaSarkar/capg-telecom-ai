import { Body, Controller, Post, UseGuards } from '@nestjs/common';
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

  @Post('ask')
  @ApiOperation({
    summary:
      'Ask the AI assistant a question and drive the multi-agent orchestration flow',
  })
  ask(@Body() dto: AskDto) {
    return this.orchestratorService.ask(dto);
  }
}
