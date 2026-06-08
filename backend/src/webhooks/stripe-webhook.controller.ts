import {
  Controller,
  Post,
  Req,
  Headers,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import { Public } from '../auth/public.decorator'
import type { Request } from 'express'

const STRIPE_WEBHOOK_EVENTS = ['invoice.payment_succeeded', 'invoice.payment_failed'] as const
type StripeWebhookEvent = (typeof STRIPE_WEBHOOK_EVENTS)[number]

@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name)

  /**
   * POST /webhooks/stripe: Stripe Webhook 受信エンドポイント。
   * MVP 段階では署名検証フローのスタブのみ実装。課金処理は TODO。
   * @Public() で JWT 認証をバイパス（Stripe 署名で認証するため）。
   */
  @Post('stripe')
  @Public()
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: Request,
  ) {
    if (!signature) throw new BadRequestException('Missing Stripe signature')

    // TODO: Stripe SDK で署名検証
    // const event = stripe.webhooks.constructEvent(req.rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET)

    const body = req.body as { type?: string }
    const eventType = body.type as StripeWebhookEvent | undefined

    this.logger.log('Stripe Webhook 受信', { type: eventType })

    // TODO: 課金フロー実装
    // if (eventType === 'invoice.payment_succeeded') { ... }
    // if (eventType === 'invoice.payment_failed') { ... }

    return { received: true }
  }
}
