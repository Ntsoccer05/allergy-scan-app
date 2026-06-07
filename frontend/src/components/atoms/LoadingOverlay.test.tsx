import { render, screen } from '@testing-library/react'
import { LoadingOverlay } from './LoadingOverlay'

describe('LoadingOverlay', () => {
  it('should show overlay when isOpen is true', () => {
    render(<LoadingOverlay isOpen={true} message="読み込み中" />)
    expect(screen.getByText('読み込み中')).toBeInTheDocument()
  })

  it('should not show overlay when isOpen is false', () => {
    render(<LoadingOverlay isOpen={false} message="読み込み中" />)
    expect(screen.queryByText('読み込み中')).not.toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    render(<LoadingOverlay isOpen={true} message="msg" subtitle="商品を離しても大丈夫です" />)
    expect(screen.getByText('商品を離しても大丈夫です')).toBeInTheDocument()
  })

  it('does not render subtitle when omitted', () => {
    render(<LoadingOverlay isOpen={true} message="msg" />)
    expect(screen.queryByText('商品を離しても大丈夫です')).not.toBeInTheDocument()
  })
})
