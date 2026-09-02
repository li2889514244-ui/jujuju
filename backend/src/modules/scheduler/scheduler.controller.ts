import { Controller, Post, HttpCode, HttpStatus, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { OrderReportScheduler } from './order-report.scheduler'
import { RefundAlertScheduler } from './refund-alert.scheduler'
import { DailyReconciliationScheduler } from './daily-reconciliation.scheduler'

@ApiTags('scheduler')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('scheduler')
export class SchedulerController {
  constructor(
    private orderReportScheduler: OrderReportScheduler,
    private refundAlertScheduler: RefundAlertScheduler,
    private dailyReconciliationScheduler: DailyReconciliationScheduler,
  ) {}

  @Post('trigger/order-report')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger daily order report' })
  async triggerOrderReport() {
    return this.orderReportScheduler.triggerManually()
  }

  @Post('trigger/refund-check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger refund check' })
  async triggerRefundCheck() {
    await this.refundAlertScheduler.checkNewRefunds()
    return { triggered: true }
  }

  @Post('trigger/reconciliation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger daily doudian reconciliation' })
  async triggerReconciliation() {
    return this.dailyReconciliationScheduler.triggerManually()
  }
}
