import { Controller, Get, Query, ParseFloatPipe, BadRequestException } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { THROTTLE_ROUTE_LIMIT, THROTTLE_ROUTE_TTL } from '../shared/throttler/throttler.constants'
import { RoutingService } from './routing.service'
import type { RouteResponse } from './routing.types'

@Controller('route')
@Throttle({ default: { limit: THROTTLE_ROUTE_LIMIT, ttl: THROTTLE_ROUTE_TTL } })
export class RoutingController {
  constructor(private readonly routingService: RoutingService) {}

  @Get()
  async getRoute(
    @Query('from_lat', ParseFloatPipe) fromLat: number,
    @Query('from_lng', ParseFloatPipe) fromLng: number,
    @Query('to_lat', ParseFloatPipe) toLat: number,
    @Query('to_lng', ParseFloatPipe) toLng: number,
    @Query('mode') mode: string,
  ): Promise<RouteResponse> {
    if (mode !== 'driving' && mode !== 'walking' && mode !== 'cycling') {
      throw new BadRequestException('mode は driving / walking / cycling のみ')
    }
    return this.routingService.getRoute(fromLat, fromLng, toLat, toLng, mode)
  }
}
