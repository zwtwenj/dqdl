import { Controller, Get } from '@nestjs/common';

/** 健康检查 */
@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'dqdl-server' };
  }
}
