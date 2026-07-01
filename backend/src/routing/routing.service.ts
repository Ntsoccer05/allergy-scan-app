import { Injectable, InternalServerErrorException, Logger, NotFoundException, OnModuleInit } from '@nestjs/common'
import type {
  OrsRouteResponse,
  OsrmRouteResponse,
  RouteResponse,
} from './routing.types'

@Injectable()
export class RoutingService implements OnModuleInit {
  private readonly logger = new Logger(RoutingService.name)

  onModuleInit() {
    const provider = process.env.ROUTING_PROVIDER ?? 'osrm'
    if (provider === 'osrm' && !process.env.ROUTING_OSRM_URL) {
      if (process.env.NODE_ENV === 'production') {
        // 公式 OSRM デモサーバーは本番利用 ToS 違反・SLA なし
        throw new Error(
          '[RoutingService] 本番環境では ROUTING_OSRM_URL の設定が必須です。' +
          '公式 OSRM デモサーバー (router.project-osrm.org) の本番利用は利用規約違反です。',
        )
      }
      this.logger.warn(
        'ROUTING_OSRM_URL 未設定 — OSRM デモサーバーにフォールバックします。本番では必ず ROUTING_OSRM_URL を設定してください。',
      )
    }
  }

  async getRoute(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    mode: 'driving' | 'walking' | 'cycling',
  ): Promise<RouteResponse> {
    const provider = process.env.ROUTING_PROVIDER ?? 'osrm'
    if (provider === 'ors') {
      return this.fetchOrs(fromLat, fromLng, toLat, toLng, mode)
    }
    return this.fetchOsrm(fromLat, fromLng, toLat, toLng, mode)
  }

  private async fetchOsrm(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    mode: 'driving' | 'walking' | 'cycling',
  ): Promise<RouteResponse> {
    // OSRM プロファイル名は mode と同じ（driving/walking/cycling）
    const profile = mode
    const baseUrl = process.env.ROUTING_OSRM_URL ?? 'http://router.project-osrm.org'
    const url = `${baseUrl}/route/v1/${profile}/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`

    this.logger.log('OSRM route request', { url })
    const res = await fetch(url)
    if (!res.ok) {
      this.logger.error('OSRM error', { status: res.status })
      throw new InternalServerErrorException('ルート取得に失敗しました')
    }

    const data = (await res.json()) as OsrmRouteResponse
    const route = data.routes[0]
    if (!route) throw new NotFoundException('ルートが見つかりません')

    return {
      geometry: route.geometry,
      distance_m: Math.round(route.legs[0].distance),
      duration_sec: Math.round(route.legs[0].duration),
    }
  }

  private async fetchOrs(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    mode: 'driving' | 'walking' | 'cycling',
  ): Promise<RouteResponse> {
    // ORS はプロファイル名が OSRM と異なるためマッピングが必要
    const profile =
      mode === 'driving' ? 'driving-car'
      : mode === 'cycling' ? 'cycling-regular'
      : 'foot-walking'
    const baseUrl = process.env.ROUTING_ORS_URL ?? 'http://localhost:8080'
    const url = `${baseUrl}/ors/v2/directions/${profile}?start=${fromLng},${fromLat}&end=${toLng},${toLat}&format=geojson`

    this.logger.log('ORS route request', { url })
    const res = await fetch(url)
    if (!res.ok) {
      this.logger.error('ORS error', { status: res.status })
      throw new InternalServerErrorException('ルート取得に失敗しました')
    }

    const data = (await res.json()) as OrsRouteResponse
    const feature = data.features[0]
    if (!feature) throw new NotFoundException('ルートが見つかりません')

    return {
      geometry: feature.geometry,
      distance_m: Math.round(feature.properties.summary.distance),
      duration_sec: Math.round(feature.properties.summary.duration),
    }
  }
}
