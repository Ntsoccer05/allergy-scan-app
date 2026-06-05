import { render, screen } from '@testing-library/react'
import { JudgmentBadge } from './JudgmentBadge'

describe('JudgmentBadge', () => {
  it('renders ng as 🔴 NG', () => {
    render(<JudgmentBadge judgment="ng" />)
    expect(screen.getByText(/NG/)).toBeInTheDocument()
  })

  it('renders partial as 🟡 注意', () => {
    render(<JudgmentBadge judgment="partial" />)
    expect(screen.getByText(/注意/)).toBeInTheDocument()
  })

  it('renders ok as ✅ なし', () => {
    render(<JudgmentBadge judgment="ok" />)
    expect(screen.getByText(/なし/)).toBeInTheDocument()
  })
})
