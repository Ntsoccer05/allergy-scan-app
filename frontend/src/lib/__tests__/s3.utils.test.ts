import { getPublicUrlFromPresigned } from '../s3.utils'

describe('getPublicUrlFromPresigned', () => {
  it('strips query string from presigned URL', () => {
    const presigned = 'https://bucket.s3.amazonaws.com/thumbs/abc.jpg?X-Amz-Algorithm=AWS4&X-Amz-Expires=3600'
    expect(getPublicUrlFromPresigned(presigned)).toBe('https://bucket.s3.amazonaws.com/thumbs/abc.jpg')
  })

  it('leaves URL unchanged when no query string', () => {
    const url = 'https://bucket.s3.amazonaws.com/thumbs/abc.jpg'
    expect(getPublicUrlFromPresigned(url)).toBe(url)
  })
})
