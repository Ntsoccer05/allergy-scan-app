import { render, screen } from '@testing-library/react'
import { ScanGuide } from './ScanGuide'

describe('ScanGuide', () => {
  it('state: idle → 「バーコードまたは原材料欄にかざしてください」を表示する', () => {
    render(<ScanGuide state="idle" />)
    expect(
      screen.getByText('バーコードまたは原材料欄にかざしてください'),
    ).toBeInTheDocument()
  })

  it('state: preview → 「撮影しました。確定またはやり直しを選んでください」を表示する', () => {
    render(<ScanGuide state="preview" />)
    expect(screen.getByText('撮影しました。確定またはやり直しを選んでください')).toBeInTheDocument()
  })

  it('state: error, error: incomplete → 「⚠️ 原材料またはバーコード全体が映るように撮影してください。」を表示する', () => {
    render(<ScanGuide state="error" error="incomplete" />)
    expect(
      screen.getByText('⚠️ 原材料またはバーコード全体が映るように撮影してください。'),
    ).toBeInTheDocument()
  })

  it('state: error, error: api_error → 「通信エラーが発生しました。再度お試しください」を表示する', () => {
    render(<ScanGuide state="error" error="api_error" />)
    expect(
      screen.getByText('通信エラーが発生しました。再度お試しください'),
    ).toBeInTheDocument()
  })

  it('state: error, error: daily_limit_exceeded → 「本日の利用上限に達しました。明日またお試しください」を表示する', () => {
    render(<ScanGuide state="error" error="daily_limit_exceeded" />)
    expect(
      screen.getByText('本日の利用上限に達しました。明日またお試しください'),
    ).toBeInTheDocument()
  })
})
