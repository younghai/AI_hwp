import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { McfgReportFrame } from '../McfgReportFrame.jsx'

describe('McfgReportFrame', () => {
  it('renders empty message when no reportUrl', () => {
    render(<McfgReportFrame reportUrl={null} />)
    expect(screen.getByText(/리포트가 없습니다/)).toBeInTheDocument()
  })

  it('renders sandboxed iframe when reportUrl provided', () => {
    render(<McfgReportFrame reportUrl="/generated/x.metrics.html" />)
    const frame = screen.getByTitle(/MCFG/)
    expect(frame).toHaveAttribute('src', '/generated/x.metrics.html')
    expect(frame).toHaveAttribute('sandbox', 'allow-same-origin')
  })
})
