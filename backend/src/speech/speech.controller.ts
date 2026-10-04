import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  ServiceUnavailableException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SpeechService } from './speech.service';

export class TtsDto {
  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsOptional()
  @IsIn(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'])
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
}

export class RealtimeSessionDto {
  @IsOptional()
  @IsString()
  customerId?: string;
}

@ApiTags('Speech')
@UseGuards(JwtAuthGuard)
@Controller('speech')
export class SpeechController {
  constructor(private readonly speechService: SpeechService) {}

  @Post('stt')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transcribe audio to text using Whisper' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('audio'))
  async speechToText(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ transcript: string }> {
    if (!file) {
      throw new BadRequestException('No audio file provided in the "audio" field.');
    }

    if (!this.speechService.isAvailable()) {
      throw new ServiceUnavailableException(
        'Speech service requires OPENAI_API_KEY. Set LLM_PROVIDER=openai and provide a valid key.',
      );
    }

    const transcript = await this.speechService.transcribe(
      file.buffer,
      file.originalname,
      file.mimetype,
    );
    return { transcript };
  }

  @Post('tts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Convert text to speech using OpenAI TTS' })
  async textToSpeech(@Body() dto: TtsDto, @Res() res: Response): Promise<void> {
    if (!dto.text?.trim()) {
      throw new BadRequestException('The "text" field is required.');
    }

    if (!this.speechService.isAvailable()) {
      throw new ServiceUnavailableException(
        'Speech service requires OPENAI_API_KEY. Set LLM_PROVIDER=openai and provide a valid key.',
      );
    }

    const audioBuffer = await this.speechService.synthesize(dto.text, dto.voice ?? 'nova');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.byteLength);
    res.end(Buffer.from(audioBuffer));
  }

  @Post('realtime/session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create an OpenAI Realtime live session for browser voice conversations' })
  async createRealtimeSession(@Body() dto: RealtimeSessionDto): Promise<Record<string, unknown>> {
    if (!this.speechService.isAvailable()) {
      throw new ServiceUnavailableException(
        'Real-time voice requires OPENAI_API_KEY and a supported Realtime model.',
      );
    }

    return this.speechService.createRealtimeSession(dto.customerId);
  }

  @Post('realtime/connect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a browser SDP offer for an OpenAI Realtime SDP answer' })
  async connectRealtime(
    @Body() sdp: string,
    @Headers('x-realtime-client-secret') clientSecret: string,
    @Res() res: Response,
  ): Promise<void> {
    if (typeof sdp !== 'string' || !sdp.trim()) {
      throw new BadRequestException('A realtime SDP offer is required.');
    }
    if (!clientSecret?.trim()) {
      throw new BadRequestException('A realtime client secret is required.');
    }
    if (!this.speechService.isAvailable()) {
      throw new ServiceUnavailableException('Real-time voice requires OPENAI_API_KEY.');
    }

    const answer = await this.speechService.exchangeRealtimeSdp(sdp, clientSecret);
    res.setHeader('Content-Type', 'application/sdp');
    res.end(answer);
  }
}
