import {
  BadRequestException,
  Body,
  Controller,
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
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SpeechService } from './speech.service';

export class TtsDto {
  text!: string;
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
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

    const transcript = await this.speechService.transcribe(file.buffer, file.originalname);
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
}
