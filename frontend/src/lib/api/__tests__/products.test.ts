import { getOthersScanned } from '../products'
import { API_BASE_URL } from '@/lib/constants'

const makeResponse = () => ({
  items: [],
  next_cursor: null,
})

describe('getOthersScanned', () => {
  beforeEach(() => {
    jest.resetAllMocks()
  })

  it('GET /products/others を credentials: include で呼ぶ', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeResponse()),
    })

    await getOthersScanned()

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/products/others`,
      { credentials: 'include' },
    )
  })

  it('cursor 引数があるとき URL に ?cursor=<値> が付く', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(makeResponse()),
    })

    const cursor = '2026-05-18T00:00:00.000Z'
    await getOthersScanned(cursor)

    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/products/others?cursor=${encodeURIComponent(cursor)}`,
      { credentials: 'include' },
    )
  })

  it('レスポンスが ok でない場合 Error を throw する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
    })

    await expect(getOthersScanned()).rejects.toThrow(
      'GET /products/others failed: 401',
    )
  })
})
