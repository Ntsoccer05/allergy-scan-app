import { render, screen } from '@testing-library/react'
import { ScanGuide } from './ScanGuide'

describe('ScanGuide', () => {
  it('state: idle → 「バーコードまたは原材料欄にかざしてください」を表示する', () => {
    render(<ScanGuide state="idle" />)
    expect(
      screen.getByText('バーコードまたは原材料欄にかざしてください'),
    ).toBeInTheDocument()
  })

  it('state: detecting → 「読み取り中...」を表示する', () => {
    render(<ScanGuide state="detecting" />)
    expect(screen.getByText('読み取り中...')).toBeInTheDocument()
  })

  it('state: stable → 「読み取り中...」を表示する', () => {
    render(<ScanGuide state="stable" />)
    expect(screen.getByText('読み取り中...')).toBeInTheDocument()
  })

  it('state: error, error: dark → 「⚠️ 明るい場所に移動してください」を表示する', () => {
    render(<ScanGuide state="error" error="dark" />)
    expect(screen.getByText('⚠️ 明るい場所に移動してください')).toBeInTheDocument()
  })

  it('state: error, error: incomplete → 「⚠️ ラベル全体が映るように離してください」を表示する', () => {
    render(<ScanGuide state="error" error="incomplete" />)
    expect(
      screen.getByText('⚠️ ラベル全体が映るように離してください'),
    ).toBeInTheDocument()
  })

  it('state: error, error: api_error → 「通信エラーが発生しました。再度お試しください」を表示する', () => {
    render(<ScanGuide state="error" error="api_error" />)
    expect(
      screen.getByText('通信エラーが発生しました。再度お試しください'),
    ).toBeInTheDocument()
  })
})
