export type SupabaseJwtPayload = {
  sub: string;
  email?: string; // anonymous auth では存在しない場合がある
  role: string;
  app_metadata: {
    provider: string;
    providers: string[];
    role?: 'admin';
  };
  user_metadata?: Record<string, unknown>; // サービストークンで省略される場合がある
  iat: number;
  exp: number;
};
