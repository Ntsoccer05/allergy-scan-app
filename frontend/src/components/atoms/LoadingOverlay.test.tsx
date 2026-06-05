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
})
