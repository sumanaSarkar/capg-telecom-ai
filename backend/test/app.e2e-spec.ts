import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

interface LoginResponseBody {
  accessToken: string;
  user: { id: string; username: string; customerId: string };
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  it('/auth/login (POST) succeeds with valid credentials', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'user1', password: 'password123' })
      .expect(200)
      .expect((res) => {
        const body = res.body as LoginResponseBody;
        expect(body.accessToken).toBeDefined();
        expect(body.user.customerId).toBe('cust-001');
      });
  });

  it('/auth/login (POST) fails with invalid credentials', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'user1', password: 'wrong' })
      .expect(401);
  });

  it('/speech/stt (POST) exists and validates missing audio', async () => {
    await request(app.getHttpServer())
      .post('/speech/stt')
      .expect(400);
  });

  afterEach(async () => {
    await app.close();
  });
});
