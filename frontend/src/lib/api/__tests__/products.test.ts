import { getOthersScanned } from '../products'

// apiFetch は内部で Supabase セッションを取得するため、クライアントをモック
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
    },
  }),
}))

const makeResponse = () => ({
  items: [],
  next_cursor: null,
})

describe('getOthersScanned', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    global.fetch = jest.fn()
  })

  it('GET /products/others を Authorization Bearer で呼ぶ', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeResponse()),
    })

    await getOthersScanned()

    expect(global.fetch).toHaveBeenCalledWith(
      '/products/others',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    )
  })

  it('cursor 引数があるとき URL に ?cursor=<値> が付く', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeResponse()),
    })

    const cursor = '2026-05-18T00:00:00.000Z'
    await getOthersScanned({ cursor })

    expect(global.fetch).toHaveBeenCalledWith(
      `/products/others?cursor=${encodeURIComponent(cursor)}`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    )
  })

  it('filter / q / store がクエリパラメータとして付与される（filter=all は省略）', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeResponse()),
    })

    await getOthersScanned({ filter: 'ng', q: 'グミ', store: 'セブン' })

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0] as string
    const params = new URLSearchParams(calledUrl.split('?')[1])
    expect(params.get('judgment')).toBe('ng')
    expect(params.get('q')).toBe('グミ')
    expect(params.get('store')).toBe('セブン')
  })

  it('レスポンスが ok でない場合 Error を throw する', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({}),
    })

    await expect(getOthersScanned()).rejects.toThrow()
  })
})
