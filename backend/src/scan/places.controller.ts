import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PlacesService, type PlaceCandidatesResult } from './places.service';
import { PlaceCandidatesDto } from './dto/place-candidates.dto';
import {
  THROTTLE_PLACES_TTL,
  THROTTLE_PLACES_LIMIT,
} from '../shared/throttler.constants';

@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  /**
   * GET /places/candidates?lat=&lng=: 場所登録用の住所・施設候補を返す。
   * 認証必須（グローバル SupabaseJwtGuard）。
   * Places API はコール課金のため厳しめのレートリミットを適用する。
   */
  @Get('candidates')
  @Throttle({
    default: { ttl: THROTTLE_PLACES_TTL, limit: THROTTLE_PLACES_LIMIT },
  })
  async getCandidates(
    @Query() dto: PlaceCandidatesDto,
  ): Promise<PlaceCandidatesResult> {
    return this.placesService.getCandidates(dto.lat, dto.lng);
  }
}
