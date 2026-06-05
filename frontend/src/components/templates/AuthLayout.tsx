type Props = { children: React.ReactNode }

export const AuthLayout = ({ children }: Props) => (
  <div className="flex min-h-screen items-center justify-center bg-background p-4">
    <div className="w-full max-w-md">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold">🥗 アレルギースキャン</h1>
        <p className="mt-1 text-sm text-muted-foreground">食品アレルギーを即座に確認</p>
      </div>
      {children}
    </div>
  </div>
)
