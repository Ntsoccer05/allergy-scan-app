import { render, screen, fireEvent } from '@testing-library/react'
import { ImageLightbox } from './ImageLightbox'

describe('ImageLightbox', () => {
  const defaultProps = {
    src: 'https://example.com/image.jpg',
    closeAriaLabel: '閉じる',
    onClose: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render the image with provided src', () => {
    const { container } = render(<ImageLightbox {...defaultProps} />)
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', 'https://example.com/image.jpg')
  })

  it('should render a dialog role', () => {
    render(<ImageLightbox {...defaultProps} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('should call onClose when close button is clicked', () => {
    render(<ImageLightbox {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('should call onClose when overlay background is clicked', () => {
    render(<ImageLightbox {...defaultProps} />)
    fireEvent.click(screen.getByRole('dialog'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('should NOT call onClose when image itself is clicked', () => {
    const { container } = render(<ImageLightbox {...defaultProps} />)
    const img = container.querySelector('img')!
    fireEvent.click(img)
    expect(defaultProps.onClose).not.toHaveBeenCalled()
  })
})
